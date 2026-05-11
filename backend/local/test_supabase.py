"""
Phase 3 verification — tests Supabase connection, schema, and auth.
Run after updating .env with real SUPABASE_URL and SUPABASE_SERVICE_KEY.

Usage: python test_supabase.py
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")

if not url or url == "https://your-project.supabase.co":
    print("ERROR: SUPABASE_URL not set in .env")
    exit(1)
if not key or key == "your-service-key":
    print("ERROR: SUPABASE_SERVICE_KEY not set in .env")
    exit(1)

client = create_client(url, key)
print(f"Connected to Supabase: {url}")

# Insert a test patient
test_patient = {
    "name": "Test Patient",
    "ic_number": "000000-00-0000",
    "ward": "TEST",
    "age": 30,
    "gender": "male",
    "assigned_doctor": "Dr. Test",
}

insert_result = client.table("patients").insert(test_patient).execute()
patient = insert_result.data[0]
patient_id = patient["id"]
print(f"Inserted test patient — id: {patient_id}")

# Query it back
select_result = client.table("patients").select("*").eq("id", patient_id).execute()
fetched = select_result.data[0]
print(f"Fetched patient: {fetched['name']} | IC: {fetched['ic_number']} | Ward: {fetched['ward']}")

# Open a test session
session_result = client.table("sessions").insert({"patient_id": patient_id}).execute()
session_id = session_result.data[0]["id"]
print(f"Opened session — id: {session_id}")

# Close the session
client.table("sessions").update({"ended_at": "now()"}).eq("id", session_id).execute()
print("Closed session")

# Clean up
client.table("sessions").delete().eq("id", session_id).execute()
client.table("patients").delete().eq("id", patient_id).execute()
print("Cleaned up test data")

print("\nPhase 3 verification PASSED — Supabase is ready.")
