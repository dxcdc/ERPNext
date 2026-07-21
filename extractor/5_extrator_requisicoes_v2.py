from common import Common
from typing import Dict
import pandas as pd
from typing import Optional, Dict
from datetime import datetime, timedelta

api = Common()


## pegar o ano atual
anoAtual = pd.Timestamp.now().year
## pegue a menor e maior data do ano atual no formato yyyy-mm-dd
menorData = f"{anoAtual}-01-01"
maiorData = f"{anoAtual}-12-31"

retorno = api.erp_request("GET", "Fiscal Year")

for fy in retorno.json().get("data", []):
    existe = 0 
    if fy.get("name") == str(anoAtual):
        existe = 1
        break

if existe != 1:
    payload = {
        "year": anoAtual,
        "year_start_date": menorData,
        "year_end_date": maiorData,
        "disabled": 0,
        "companies": [{"company": "CDC"}]
    }
    resp_create = api.erp_request("POST", "Fiscal Year", payload=payload).text

# # Criar
#
# # Se o seu helper usar 'data=' ao invés de 'json=', troque para: data=payload
# print(resp_create)


# pedidos = api.erp_request("GET", "Stock Entry/MAT-STE-2025-00010").text


custom_field_payload_cab_texto_multi = {
  "dt": "Stock Entry",
  "fieldname": "idpedido_ongsys",
  "label": "Texto Multi (CAB)",
  "fieldtype": "Small Text", 
  "insert_after": "posting_date",
  "in_list_view": 0,
  "in_standard_filter": 0,
  "reqd": 0
}


resp = api.erp_request("post","Custom%20Field", payload=custom_field_payload_cab_texto_multi)


custom_field_payload_cab_texto_multi = {
  "dt": "Stock Entry",
  "fieldname": "titulo_ongsys",
  "label": "Texto Multi (CAB)",
  "fieldtype": "Small Text", 
  "insert_after": "posting_date",
  "in_list_view": 0,
  "in_standard_filter": 0,
  "reqd": 0
}


resp = api.erp_request("post","Custom%20Field", payload=custom_field_payload_cab_texto_multi)



COMPANY_NAME = "CDC"

lista_todos_pedidos = api.get_all_ongsys("pedidos")


file_path = "centro_de_custo_armazen.csv"
df = pd.read_csv(file_path, sep=";", dtype=str, encoding="latin-1")

df_dict = dict(
    zip(
        df["centro_custo"].astype(str).str.strip(),
        df["armazem"].astype(str).str.strip()
    )
)


lista_pedidos_finalizados = [
    pedido for pedido in lista_todos_pedidos
    if pedido.get("tipoPedido") == "Produto"
    and pedido.get("statusPedido") == "Ordem finalizada"
]


# 1. Calcula a data de 60 dias atrás
data_limite = datetime.now() - timedelta(days=30)

# 2. Filtra a lista assumindo que cada pedido é um dicionário com a chave 'data'
pedidos_ultimos_2_meses = [
    pedido for pedido in lista_pedidos_finalizados 
    if datetime.fromisoformat(pedido['dataPedido'] )  >= data_limite
]

for pedido in pedidos_ultimos_2_meses:
    logs = pedido.get("logs", [])
   
    primeiro_log = sorted(logs, key=lambda x: x['data'],reverse=True)[0]
    try:
        idpedido = str(pedido.get("idPedido"))
        payload_lancamento = {"doctype": "Stock Entry", "stock_entry_type": "Entrada de Material", "posting_date": primeiro_log.get("data"), "set_posting_time" : 1, "docstatus": 1,"idpedido_ongsys": idpedido ,"titulo_ongsys" : pedido.get("titulo"), "company": COMPANY_NAME,"items": []}

        retorno = api.erp_request("GET", "Stock Entry", params={"filters": f'[[ "idpedido_ongsys", "=", "{idpedido}" ]]'})
        if retorno.json().get("data"):
         #   print(f"Pedido {pedido.get('idPedido')} já existe no ERPNext. Pulando...")
            continue

        for item in pedido.get("itensPedido", []):
            centrocusto = item.get("centroCusto")
            if df_dict.get(centrocusto) is None:
            #    print(f"Pedido {pedido.get('idPedido')} - Centro de custo {centrocusto} não mapeado. Pulando item...")
                continue
            if float(item.get("quantidade", 0)) < 0.01:
           #     print(f"Pedido {pedido.get('idPedido')} - Item {item.get('idProduto')} ignorado (quantidade 0).")
                continue

            payload_lancamento["items"].append({
                "item_code": str(item.get("idProduto")),
                "qty": item.get("quantidade"),
                "t_warehouse": df_dict.get(centrocusto)+ " - C"
            })
        response = api.erp_request("POST", "Stock Entry", payload=payload_lancamento)
       # print(f"Pedido {pedido.get('idPedido')} - Status: {response.status_code}")

        # if pedido.get("idPedido") == "27" or pedido.get("idpedido") == "374":
        #     print(response.text)
            
    except Exception as e:
        print(f"Erro ao processar pedido {pedido.get('idPedido')}: {e}")

   

