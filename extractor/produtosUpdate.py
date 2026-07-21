from common import Common
from typing import Dict
api = Common()




produtos =  api.get_all_ongsys("produtos")


for p in produtos:
    id = p["id"]
    res = api.erp_request("PUT", f"Item/{id}", payload={"valuation_rate": 1})
    print(p["nomeProduto"])

