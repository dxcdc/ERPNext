from common import Common
from typing import Dict
import pandas as pd
api = Common()


COMPANY_NAME = "CDC"


company = api.erp_request("GET", "Company")

# Create a new company with the provided dat
def convert_df_to_payload_list(df: pd.DataFrame, company_name: str) -> list:
    payload_list = []
    for _, row in df.iterrows():
        payload_wh = {
            "warehouse_name": row["armazem"],  # Replace with the actual column name in your CSV
            "company": company_name,
            "is_group": 0,
        }
        payload_list.append(payload_wh)
    return payload_list

# Read the CSV file
file_path = "centro_de_custo_armazen.csv"
df = pd.read_csv(file_path, sep=";", dtype=str, encoding="latin-1")
# Display the first few rows of the data


payload_list = convert_df_to_payload_list(df, COMPANY_NAME)


# Check if the warehouse already exists before creating it
for payload in payload_list:
    # Check if the warehouse exists
    response = api.erp_request("GET","Warehouse")
    existing_warehouses = [] 
    try:
        existing_warehouses = response.json().get("data")
    except Exception as e:
        continue
    if existing_warehouses is None:
        existing_warehouses = []
 
    if any(wh.get("name").replace(" - CDC","") == payload["warehouse_name"] for wh in existing_warehouses):
        print(f"Warehouse already exists: {payload['warehouse_name']}")
    else:
        response = api.erp_request("POST","Warehouse", payload)
