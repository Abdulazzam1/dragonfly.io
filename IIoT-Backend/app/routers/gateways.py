from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.models import Gateway, Project, TelemetryLog
from app.routers.auth import get_current_user
from typing import Optional, List, Any

router = APIRouter(prefix="/api/gateways", tags=["Gateways"])

class GatewaySchema(BaseModel):
    gateway_id: Optional[int] = None
    hmi_code: Optional[str] = None
    name: str
    project_id: Optional[int] = None
    status: Optional[str] = "offline"
    config: Optional[List[Any]] = []

    class Config:
        from_attributes = True

# ─── Bucket config per range ──────────────────────────────────────────────────
# Sama dengan BUCKET_MS di frontend, tapi dalam format PostgreSQL interval

RANGE_CONFIG = {
    "1h":  {"interval": "NOW() - INTERVAL '1 hour'",   "trunc": "minute",  "bucket_minutes": 1  },
    "6h":  {"interval": "NOW() - INTERVAL '6 hours'",  "trunc": "minute",  "bucket_minutes": 5  },
    "24h": {"interval": "NOW() - INTERVAL '24 hours'", "trunc": "minute",  "bucket_minutes": 15 },
    "7d":  {"interval": "NOW() - INTERVAL '7 days'",   "trunc": "hour",    "bucket_minutes": 60 },
    "30d": {"interval": "NOW() - INTERVAL '30 days'",  "trunc": "hour",    "bucket_minutes": 360},
}

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_gateway(gateway: GatewaySchema, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ["admin", "rasindo_operator"]:
        raise HTTPException(status_code=403, detail="Akses ditolak!")
    db_gateway = Gateway(hmi_code=gateway.hmi_code, name=gateway.name, project_id=gateway.project_id, status=gateway.status)
    try:
        db.add(db_gateway)
        db.commit()
        db.refresh(db_gateway)
        return {"status": "success", "data": db_gateway}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan: {str(e)}")

@router.get("/")
def get_gateways(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        role = current_user.get("role")
        user_company_id = current_user.get("company_id")
        if role in ["client_operator", "client_user"]:
            gateways = (
                db.query(Gateway)
                .join(Project, Gateway.project_id == Project.project_id)
                .filter(Project.company_id == user_company_id)
                .all()
            )
            return {"status": "success", "data": gateways}
        gateways = db.query(Gateway).all()
        return {"status": "success", "data": gateways}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{gateway_id}")
def get_gateway(gateway_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    gateway = db.query(Gateway).filter(Gateway.gateway_id == gateway_id).first()
    if not gateway:
        raise HTTPException(status_code=404, detail="Gateway tidak ditemukan")

    # Untuk widget value/trend/gauge/status: cukup 200 data terbaru
    logs = (
        db.query(TelemetryLog)
        .filter(TelemetryLog.gateway_id == gateway_id)
        .order_by(TelemetryLog.created_at.desc())
        .limit(200)
        .all()
    )
    logs_asc = list(reversed(logs))

    return {
        "status": "success",
        "data": {
            "gateway_id": gateway.gateway_id,
            "name": gateway.name,
            "hmi_code": gateway.hmi_code,
            "status": gateway.status,
            "last_ping": gateway.last_ping,
            "project_id": gateway.project_id,
            "config": gateway.config if gateway.config is not None else [],
            "logs": [
                {
                    "id": l.id,
                    "created_at": l.created_at.isoformat() if l.created_at else None,
                    "payload": l.payload,
                    "gateway_id": l.gateway_id,
                }
                for l in logs_asc
            ]
        }
    }

@router.get("/{gateway_id}/chart")
def get_gateway_chart(
    gateway_id: int,
    range: str = Query(default="1h", regex="^(1h|6h|24h|7d|30d)$"),
    keys: str = Query(default=""),   # comma-separated MQTT keys, e.g. "tempSensor,humidSensor"
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Endpoint khusus chart — return data pre-aggregated per bucket dari PostgreSQL.
    Jauh lebih efisien dari mengirim semua raw data ke frontend.

    Contoh: GET /api/gateways/1/chart?range=30d&keys=tempSensor,humidSensor
    Response: [{ "time": "2026-06-01T00:00:00", "tempSensor": 25.4, "humidSensor": 60.1 }, ...]
    """
    gateway = db.query(Gateway).filter(Gateway.gateway_id == gateway_id).first()
    if not gateway:
        raise HTTPException(status_code=404, detail="Gateway tidak ditemukan")

    cfg = RANGE_CONFIG.get(range, RANGE_CONFIG["1h"])
    cutoff_expr  = cfg["interval"]
    bucket_mins  = cfg["bucket_minutes"]

    key_list = [k.strip() for k in keys.split(",") if k.strip()] if keys else []
    if not key_list:
        return {"status": "success", "data": []}

    try:
        # Bangun SELECT untuk setiap key
        # PostgreSQL: (payload->>'key')::float untuk cast JSON string ke angka
        select_parts = ", ".join([
            f"AVG((payload->>'{k}')::float) AS \"{k}\""
            for k in key_list
        ])

        sql = text(f"""
            SELECT
                date_trunc('minute', created_at) 
                    + (FLOOR(EXTRACT(EPOCH FROM (created_at - date_trunc('minute', created_at))) / :bucket_secs) * :bucket_secs || ' seconds')::interval AS bucket,
                {select_parts}
            FROM telemetry_logs
            WHERE gateway_id = :gateway_id
              AND created_at >= {cutoff_expr}
            GROUP BY bucket
            ORDER BY bucket ASC
        """)

        rows = db.execute(sql, {
            "gateway_id": gateway_id,
            "bucket_secs": bucket_mins * 60,
        }).fetchall()

        result = []
        for row in rows:
            point = {"time": row[0].isoformat() if row[0] else None}
            for i, k in enumerate(key_list):
                val = row[i + 1]
                point[k] = round(float(val), 4) if val is not None else None
            result.append(point)

        return {"status": "success", "data": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chart query error: {str(e)}")

@router.put("/{gateway_id}")
def update_gateway(gateway_id: int, payload: GatewaySchema, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ["admin", "rasindo_operator"]:
        raise HTTPException(status_code=403, detail="Akses ditolak!")
    gateway = db.query(Gateway).filter(Gateway.gateway_id == gateway_id).first()
    if not gateway:
        raise HTTPException(status_code=404, detail="Gateway tidak ditemukan")
    try:
        gateway.hmi_code = payload.hmi_code
        gateway.name = payload.name
        gateway.project_id = payload.project_id
        gateway.status = payload.status
        gateway.config = payload.config
        db.commit()
        return {"status": "success", "message": "Gateway berhasil diperbarui"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{gateway_id}")
def delete_gateway(gateway_id: int, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ["admin", "rasindo_operator"]:
        raise HTTPException(status_code=403, detail="Akses ditolak!")
    gateway = db.query(Gateway).filter(Gateway.gateway_id == gateway_id).first()
    if not gateway:
        raise HTTPException(status_code=404, detail="Gateway tidak ditemukan")
    try:
        db.delete(gateway)
        db.commit()
        return {"status": "success", "message": "Gateway berhasil dihapus"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))