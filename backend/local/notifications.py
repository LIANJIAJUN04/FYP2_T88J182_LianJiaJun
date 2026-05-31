import asyncio
import logging
import os
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

logger = logging.getLogger(__name__)

_TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
_TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID", "")
_ADMIN_EMAIL        = os.getenv("ADMIN_EMAIL", "")
_SMTP_HOST          = os.getenv("SMTP_HOST", "smtp.gmail.com")
_SMTP_PORT          = int(os.getenv("SMTP_PORT", "587"))
_SMTP_USER          = os.getenv("SMTP_USER", "")
_SMTP_PASSWORD      = os.getenv("SMTP_PASSWORD", "")

_METRIC_LABELS = {
    "spo2":        "SpO₂",
    "bpm":         "Heart Rate",
    "temperature": "Temperature",
}
_METRIC_UNITS = {
    "spo2":        "%",
    "bpm":         " bpm",
    "temperature": "°C",
}


def _build_messages(
    patient_name: str,
    patient_id: str,
    metric: str,
    value: float,
    alert_type: str,
) -> tuple[str, str, str]:
    """Return (telegram_text, email_subject, email_html)."""
    label = _METRIC_LABELS.get(metric, metric)
    unit  = _METRIC_UNITS.get(metric, "")
    ts    = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    if alert_type == "danger":
        severity   = "\U0001f6a8 DANGER"
        color      = "#dc2626"
        subj_label = "DANGER"
    else:
        severity   = "⚠️ ML ANOMALY"
        color      = "#d97706"
        subj_label = "Anomaly Detected"

    telegram_text = (
        f"{severity} — MediSync Alert\n\n"
        f"Patient: {patient_name}\n"
        f"Metric:  {label}\n"
        f"Value:   {value}{unit}\n"
        f"Time:    {ts}\n\n"
        f"Patient ID: {patient_id}\n\n"
        f"Check the MediSync admin dashboard for details."
    )

    email_subject = f"[MediSync] {subj_label}: {patient_name} — {label}"

    email_html = f"""
<html>
<body style="font-family:sans-serif;background:#f0f0f8;margin:0;padding:32px;">
  <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:12px;
              padding:28px;border-left:6px solid {color};box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <h2 style="margin:0 0 20px;font-size:20px;color:{color};">{severity} &mdash; MediSync Alert</h2>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 4px;color:#666;width:120px;">Patient</td>
        <td style="padding:10px 4px;font-weight:600;color:#1a1a2e;">{patient_name}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 4px;color:#666;">Metric</td>
        <td style="padding:10px 4px;font-weight:600;color:#1a1a2e;">{label}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 4px;color:#666;">Value</td>
        <td style="padding:10px 4px;font-weight:700;color:{color};font-size:17px;">{value}{unit}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 4px;color:#666;">Time</td>
        <td style="padding:10px 4px;color:#1a1a2e;">{ts}</td>
      </tr>
      <tr>
        <td style="padding:10px 4px;color:#666;">Patient ID</td>
        <td style="padding:10px 4px;color:#888;font-size:12px;font-family:monospace;">{patient_id}</td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#999;">
      Log in to the MediSync admin dashboard to review this alert.
    </p>
  </div>
</body>
</html>
"""

    return telegram_text, email_subject, email_html


async def _send_telegram(text: str) -> float | None:
    """Send Telegram message. Returns round-trip latency in ms, or None on skip/error."""
    if not _TELEGRAM_BOT_TOKEN or not _TELEGRAM_CHAT_ID:
        logger.debug("[notify] Telegram not configured — skipping")
        return None
    url = f"https://api.telegram.org/bot{_TELEGRAM_BOT_TOKEN}/sendMessage"
    t0 = datetime.now(timezone.utc).timestamp()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={
                "chat_id":    _TELEGRAM_CHAT_ID,
                "text":       text,
                "parse_mode": "HTML",
            })
        rtt_ms = (datetime.now(timezone.utc).timestamp() - t0) * 1000
        if resp.status_code == 200:
            logger.info("[notify] Telegram sent OK — RTT %.0f ms", rtt_ms)
            return rtt_ms
        else:
            logger.warning("[notify] Telegram API %s: %s", resp.status_code, resp.text[:200])
            return None
    except Exception as exc:
        logger.warning("[notify] Telegram send failed: %s", exc)
        return None


def _send_email_sync(subject: str, html_body: str) -> float | None:
    """Send email. Returns round-trip latency in ms, or None on skip/error."""
    if not all([_ADMIN_EMAIL, _SMTP_USER, _SMTP_PASSWORD]):
        logger.debug("[notify] Email not configured — skipping")
        return None
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = _SMTP_USER
    msg["To"]      = _ADMIN_EMAIL
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    t0 = datetime.now(timezone.utc).timestamp()
    try:
        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(_SMTP_USER, _SMTP_PASSWORD)
            server.sendmail(_SMTP_USER, [_ADMIN_EMAIL], msg.as_string())
        rtt_ms = (datetime.now(timezone.utc).timestamp() - t0) * 1000
        logger.info("[notify] Email sent to %s — RTT %.0f ms", _ADMIN_EMAIL, rtt_ms)
        return rtt_ms
    except Exception as exc:
        logger.warning("[notify] Email send failed: %s", exc)
        return None


async def notify_alert(
    patient_name: str,
    patient_id: str,
    metric: str,
    value: float,
    alert_type: str,  # "danger" | "anomaly"
) -> None:
    """Send Telegram + email for a newly opened alert.

    Both channels run concurrently; a failure in one does not block the other.
    Called via asyncio.create_task so it never delays the readings response.
    Logs precise RTT for each channel to support O1 empirical measurement.
    """
    t_notify_start = datetime.now(timezone.utc)
    logger.info(
        "[notify] notify_alert() started at %s | patient=%s metric=%s value=%s type=%s",
        t_notify_start.isoformat(), patient_id, metric, value, alert_type,
    )

    telegram_text, email_subject, email_html = _build_messages(
        patient_name, patient_id, metric, value, alert_type
    )

    telegram_rtt, email_rtt = await asyncio.gather(
        _send_telegram(telegram_text),
        asyncio.to_thread(_send_email_sync, email_subject, email_html),
        return_exceptions=True,
    )

    total_ms = (datetime.now(timezone.utc) - t_notify_start).total_seconds() * 1000
    logger.info(
        "[notify] notify_alert() done — total=%.0f ms | telegram_rtt=%s ms | email_rtt=%s ms",
        total_ms,
        f"{telegram_rtt:.0f}" if isinstance(telegram_rtt, float) else "skipped/err",
        f"{email_rtt:.0f}" if isinstance(email_rtt, float) else "skipped/err",
    )
