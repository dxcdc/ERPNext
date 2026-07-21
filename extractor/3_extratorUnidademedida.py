
from common import Common
import json 
api = Common()
todos_produtos = api.get_all_ongsys("produtos")
# Pegar todos os grupos distintos
grupos_distintos = set()
for produto in todos_produtos:
    grupo = produto.get("unidadeMedida")
    if grupo:
        grupos_distintos.add(grupo)

grupos_erp = api.erp_request("GET", "uom")
grupos_erp_json =  json.loads(grupos_erp.text)
grupos_erp_nomes = {grupo["name"] for grupo in grupos_erp_json.get("data", [])}

grupos_para_criar = grupos_distintos - grupos_erp_nomes
for grupo in grupos_para_criar:
    payload_uom = {
        "uom_name": grupo,
        "enabled": 1,
        "must_be_whole_number": 0,  # mude para 1 se quiser tudo inteiro
    }
    resp = api.erp_request("POST","UOM", grupo, payload_uom)
