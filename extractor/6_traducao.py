from common import Common
from typing import Dict
import pandas as pd
from typing import Optional, Dict
api = Common()


# leia o arquivo de tradução.csv
import csv
traducoes = []
with open("tradução.csv", mode="r", encoding="utf-8") as file:
    reader = csv.reader(file)
    next(reader)  # Pular o cabeçalho
    for row in reader:
        source_text = row[0]
        translated_text = row[1]
        traducoes.append((source_text, translated_text))

## preciso fazer o trim no texto


for source_text, translated_text in traducoes:
    payload_traducao = {
        "language": "pt-BR",
        "source_text": source_text.strip(),
        "translated_text": translated_text.strip(),
    }
    api.erp_request("POST", "Translation", None, payload_traducao)






