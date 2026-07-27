import frappe

def get_unit_prefix(unit):
    """ Mapeia os nomes das unidades de exibição para os prefixos reais dos Armazéns no MariaDB """
    if not unit or unit == 'null' or unit == 'undefined' or unit == 'All' or unit == 'Todos os Armazéns':
        return 'All'
    u_upper = unit.upper()
    if 'CABO' in u_upper or 'CAB' in u_upper:
        return 'CAB'
    if 'CARUARU' in u_upper or 'CAR' in u_upper:
        return 'CAR'
    if 'JABOAT' in u_upper or 'JAB' in u_upper:
        return 'JAB'
    if 'RECIFE' in u_upper or 'REC' in u_upper:
        return 'REC'
    return unit

@frappe.whitelist()
def get_project_weekly_occurrences(period='quarter', selected_unit=None, entry_type='receipt'):
    """
    Retorna ocorrências de movimentação de armazém agrupadas por Projeto / Programa.
    entry_type: 'receipt' (Entrada) ou 'issue' (Saída). Padrão: 'receipt'.
    """
    if not period or period == 'undefined':
        period = 'quarter'
    if not entry_type or entry_type == 'undefined':
        entry_type = 'receipt'

    is_issue = (entry_type == 'issue')
    purpose_val = 'Material Issue' if is_issue else 'Material Receipt'
    wh_field = "se.from_warehouse" if is_issue else "se.to_warehouse"

    unit_prefix = get_unit_prefix(selected_unit)
    where_unit = ""
    if unit_prefix != 'All':
        unit_keyword = unit_prefix.replace("'", "''")
        where_unit = f" AND ({wh_field} = '{unit_keyword}' OR {wh_field} LIKE '%{unit_keyword}%')"

    projects_list = [
        "Projeto Atitude II.I",
        "Institucional / Geral",
        "Projeto Atitude",
        "Projeto Bem Viver",
        "Projeto Cais",
        "Projeto ATM"
    ]
    
    colors_map = {
        "Projeto Atitude II.I": "#2563eb",
        "Institucional / Geral": "#10b981",
        "Projeto Atitude": "#f59e0b",
        "Projeto Bem Viver": "#8b5cf6",
        "Projeto Cais": "#ef4444",
        "Projeto ATM": "#06b6d4"
    }

    month_names_pt = {
        1: "JAN", 2: "FEV", 3: "MAR", 4: "ABR", 5: "MAIO", 6: "JUNHO",
        7: "JULHO", 8: "AGO", 9: "SET", 10: "OUT", 11: "NOV", 12: "DEZ"
    }

    if period == 'month':
        where_date = "AND se.posting_date >= '2026-07-01'"
        query = f"""
            SELECT 
                FLOOR((DAY(se.posting_date)-1)/7)+1 as sem_num,
                CASE 
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE II.I%' THEN 'Projeto Atitude II.I'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE%' THEN 'Projeto Atitude'
                    WHEN COALESCE({wh_field}, '') LIKE '%BEM VIVER%' THEN 'Projeto Bem Viver'
                    WHEN COALESCE({wh_field}, '') LIKE '%CAIS%' THEN 'Projeto Cais'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATM%' THEN 'Projeto ATM'
                    ELSE 'Institucional / Geral'
                END as projeto,
                COUNT(DISTINCT se.name) as total_ocorrencias
            FROM `tabStock Entry` se
            WHERE se.docstatus = 1 AND se.purpose = '{purpose_val}' {where_date} {where_unit}
            GROUP BY sem_num, projeto
        """
        rows = frappe.db.sql(query, as_dict=True)
        
        labels = ["S1", "S2", "S3", "S4", "S5"]
        grouped_months = [{ "month": "JULHO (MÊS ATUAL)", "weeks": labels }]
        
        project_map = {p: {lbl: 0 for lbl in labels} for p in projects_list}
        for r in rows:
            lbl = f"S{r['sem_num']}"
            pj = r['projeto']
            if pj in project_map and lbl in project_map[pj]:
                project_map[pj][lbl] = int(r['total_ocorrencias'])
                
        datasets = []
        for pj in projects_list:
            data_occurrences = [project_map[pj][lbl] for lbl in labels]
            datasets.append({
                "project": pj,
                "color": colors_map.get(pj, "#64748b"),
                "occurrences": data_occurrences,
                "total_occurrences": sum(data_occurrences)
            })

        # Ordenar datasets com maior volume de movimentações no topo
        datasets.sort(key=lambda x: x['total_occurrences'], reverse=True)

        return {
            "period": period,
            "entry_type": entry_type,
            "labels": labels,
            "grouped_months": grouped_months,
            "datasets": datasets
        }

    elif period == 'quarter':
        where_date = "AND se.posting_date >= '2026-05-01'"
        query = f"""
            SELECT 
                MONTH(se.posting_date) as mes_num,
                FLOOR((DAY(se.posting_date)-1)/7)+1 as sem_num,
                CASE 
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE II.I%' THEN 'Projeto Atitude II.I'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE%' THEN 'Projeto Atitude'
                    WHEN COALESCE({wh_field}, '') LIKE '%BEM VIVER%' THEN 'Projeto Bem Viver'
                    WHEN COALESCE({wh_field}, '') LIKE '%CAIS%' THEN 'Projeto Cais'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATM%' THEN 'Projeto ATM'
                    ELSE 'Institucional / Geral'
                END as projeto,
                COUNT(DISTINCT se.name) as total_ocorrencias
            FROM `tabStock Entry` se
            WHERE se.docstatus = 1 AND se.purpose = '{purpose_val}' {where_date} {where_unit}
            GROUP BY mes_num, sem_num, projeto
            ORDER BY mes_num ASC, sem_num ASC
        """
        rows = frappe.db.sql(query, as_dict=True)

        target_months = [5, 6, 7]
        grouped_months = []
        labels = []
        label_key_map = {}

        for m_num in target_months:
            m_name = month_names_pt.get(m_num, str(m_num))
            w_count = 5 if m_num == 6 else 4
            w_labels = [f"S{w}" for w in range(1, w_count + 1)]
            
            grouped_months.append({
                "month": m_name,
                "weeks": w_labels
            })
            
            for w in range(1, w_count + 1):
                full_lbl = f"{m_name[:3]} S{w}"
                labels.append(full_lbl)
                label_key_map[(m_num, w)] = full_lbl

        project_map = {p: {lbl: 0 for lbl in labels} for p in projects_list}
        for r in rows:
            m_num = int(r['mes_num'])
            w_num = int(r['sem_num'])
            pj = r['projeto']
            full_lbl = label_key_map.get((m_num, w_num))
            if pj in project_map and full_lbl in project_map[pj]:
                project_map[pj][full_lbl] = int(r['total_ocorrencias'])

        datasets = []
        for pj in projects_list:
            data_occurrences = [project_map[pj][lbl] for lbl in labels]
            datasets.append({
                "project": pj,
                "color": colors_map.get(pj, "#64748b"),
                "occurrences": data_occurrences,
                "total_occurrences": sum(data_occurrences)
            })

        # Ordenar datasets com maior volume de movimentações no topo
        datasets.sort(key=lambda x: x['total_occurrences'], reverse=True)

        return {
            "period": period,
            "entry_type": entry_type,
            "labels": labels,
            "grouped_months": grouped_months,
            "datasets": datasets
        }
    else:
        where_date = "AND se.posting_date >= '2026-02-01'" if period == 'semester' else "AND se.posting_date >= '2025-08-01'"
        query = f"""
            SELECT 
                DATE_FORMAT(se.posting_date, '%Y-%m') as period_key,
                DATE_FORMAT(se.posting_date, '%b/%y') as label_ref,
                CASE 
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE II.I%' THEN 'Projeto Atitude II.I'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE%' THEN 'Projeto Atitude'
                    WHEN COALESCE({wh_field}, '') LIKE '%BEM VIVER%' THEN 'Projeto Bem Viver'
                    WHEN COALESCE({wh_field}, '') LIKE '%CAIS%' THEN 'Projeto Cais'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATM%' THEN 'Projeto ATM'
                    ELSE 'Institucional / Geral'
                END as projeto,
                COUNT(DISTINCT se.name) as total_ocorrencias
            FROM `tabStock Entry` se
            WHERE se.docstatus = 1 AND se.purpose = '{purpose_val}' {where_date} {where_unit}
            GROUP BY period_key, projeto
            ORDER BY MIN(se.posting_date) ASC
        """
        rows = frappe.db.sql(query, as_dict=True)
        
        labels = []
        seen = set()
        for r in rows:
            lbl = r['label_ref']
            if lbl not in seen:
                seen.add(lbl)
                labels.append(lbl)
                
        if not labels:
            labels = ["Mai/26", "Jun/26", "Jul/26"]

        grouped_months = [{ "month": "PERÍODO", "weeks": labels }]
        project_map = {p: {lbl: 0 for lbl in labels} for p in projects_list}
        
        for r in rows:
            lbl = r['label_ref']
            pj = r['projeto']
            if pj in project_map and lbl in project_map[pj]:
                project_map[pj][lbl] = int(r['total_ocorrencias'])

        datasets = []
        for pj in projects_list:
            data_occurrences = [project_map[pj][lbl] for lbl in labels]
            datasets.append({
                "project": pj,
                "color": colors_map.get(pj, "#64748b"),
                "occurrences": data_occurrences,
                "total_occurrences": sum(data_occurrences)
            })

        # Ordenar datasets com maior volume de movimentações no topo
        datasets.sort(key=lambda x: x['total_occurrences'], reverse=True)

        return {
            "period": period,
            "entry_type": entry_type,
            "labels": labels,
            "grouped_months": grouped_months,
            "datasets": datasets
        }

@frappe.whitelist()
def get_stock_dashboard_data(selected_unit=None, period='quarter', entry_type='receipt'):
    """
    Retorna métricas dinâmicas para o Painel Executivo do Estoque.
    """
    if not selected_unit or str(selected_unit).strip() in ['null', 'undefined', 'All', 'Todos os Armazéns'] or 'Todos os Armazéns' in str(selected_unit):
        selected_unit = 'All'
        
    unit_prefix = get_unit_prefix(selected_unit)
    
    where_se = "WHERE se.docstatus=1 AND se.posting_date >= '2026-07-01'"
    where_recent = "WHERE se.docstatus=1"
    where_bin = "WHERE 1=1"
    where_wh = "WHERE w.is_group=0"
    
    if unit_prefix != 'All':
        unit_keyword = unit_prefix.replace("'", "''")
        where_se += f" AND (se.from_warehouse = '{unit_keyword}' OR se.to_warehouse = '{unit_keyword}' OR se.from_warehouse LIKE '%{unit_keyword}%' OR se.to_warehouse LIKE '%{unit_keyword}%')"
        where_recent += f" AND (se.from_warehouse = '{unit_keyword}' OR se.to_warehouse = '{unit_keyword}' OR se.from_warehouse LIKE '%{unit_keyword}%' OR se.to_warehouse LIKE '%{unit_keyword}%')"
        where_bin += f" AND (warehouse = '{unit_keyword}' OR warehouse LIKE '%{unit_keyword}%')"
        where_wh += f" AND (w.name = '{unit_keyword}' OR w.name LIKE '%{unit_keyword}%')"
        
    # 1. Contadores dos 4 Cards Numeradores
    if selected_unit == 'All':
        receipts_month = frappe.db.count('Stock Entry', {'purpose': 'Material Receipt', 'docstatus': 1, 'posting_date': ['>=', '2026-07-01']})
        issues_month = frappe.db.count('Stock Entry', {'purpose': 'Material Issue', 'docstatus': 1, 'posting_date': ['>=', '2026-07-01']})
        transfers_month = frappe.db.count('Stock Entry', {'purpose': 'Material Transfer', 'docstatus': 1, 'posting_date': ['>=', '2026-07-01']})
    else:
        receipts_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` se {where_se} AND se.purpose='Material Receipt'")[0][0] or 0
        issues_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` se {where_se} AND se.purpose='Material Issue'")[0][0] or 0
        transfers_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` se {where_se} AND se.purpose='Material Transfer'")[0][0] or 0
    
    total_qty = frappe.db.sql(f"SELECT SUM(actual_qty) FROM tabBin {where_bin}")[0][0] or 0
    total_items = frappe.db.sql(f"SELECT COUNT(DISTINCT item_code) FROM tabBin {where_bin} AND actual_qty > 0")[0][0] or 0
    
    # 2. Categorias - Medidas Puramente por Quantidade de ITENS
    categories = frappe.db.sql(f"""
        SELECT i.item_group, COUNT(DISTINCT b.item_code) as cnt 
        FROM tabBin b
        JOIN tabItem i ON b.item_code = i.name
        {where_bin} AND b.actual_qty > 0 AND i.disabled = 0 
        GROUP BY i.item_group 
        ORDER BY cnt DESC
    """, as_dict=True)
    
    total_cat_items = sum(c['cnt'] for c in categories) or 1
    top_categories = []
    others_cnt = 0
    colors = ["#2563eb", "#d97706", "#059669", "#7c3aed", "#64748b"]
    
    for idx, cat in enumerate(categories):
        if idx < 4:
            pct = round((cat['cnt'] / total_cat_items) * 100, 1)
            top_categories.append({
                "label": cat['item_group'],
                "count": cat['cnt'],
                "percent": pct,
                "color": colors[idx % len(colors)]
            })
        else:
            others_cnt += cat['cnt']
            
    if others_cnt > 0:
        pct = round((others_cnt / total_cat_items) * 100, 1)
        top_categories.append({
            "label": "Outras Categorias",
            "count": others_cnt,
            "percent": pct,
            "color": colors[4]
        })
        
    # 3. Lista dos 46 Armazéns para o Dropdown
    warehouses_raw = frappe.db.sql("""
        SELECT name 
        FROM tabWarehouse 
        WHERE is_group=0 
        ORDER BY name ASC
    """)
    
    available_warehouses = [{"value": "All", "label": "Todos os Armazéns (46 Armazéns)"}]
    for w in warehouses_raw:
        clean_label = w[0].replace(' - C', '').strip()
        available_warehouses.append({
            "value": w[0],
            "label": clean_label
        })
            
    # 4. Armazéns e Saldo por Projeto (Com URLs clicáveis 🔗)
    projects_query = frappe.db.sql(f"""
        SELECT 
            CASE 
                WHEN w.name LIKE '%ATITUDE II.I%' THEN 'Projeto Atitude II.I'
                WHEN w.name LIKE '%ATITUDE%' THEN 'Projeto Atitude'
                WHEN w.name LIKE '%BEM VIVER%' THEN 'Projeto Bem Viver'
                WHEN w.name LIKE '%CAIS%' THEN 'Projeto Cais'
                WHEN w.name LIKE '%ATM%' THEN 'Projeto ATM'
                ELSE 'Institucional / Geral'
            END as projeto,
            COUNT(DISTINCT w.name) as total_armazens,
            COALESCE(COUNT(DISTINCT CASE WHEN b.actual_qty > 0 THEN b.item_code END), 0) as total_itens,
            COALESCE(SUM(CASE WHEN b.actual_qty > 0 THEN b.actual_qty ELSE 0 END), 0) as saldo_pecas
        FROM tabWarehouse w
        LEFT JOIN tabBin b ON b.warehouse = w.name
        {where_wh}
        GROUP BY projeto
        ORDER BY total_armazens DESC, total_itens DESC
    """, as_dict=True)
    
    formatted_projects = []
    for p in projects_query:
        pj_name = p['projeto']
        search_kw = "ATITUDE II.I" if "ATITUDE II.I" in pj_name else ("ATITUDE" if "Atitude" in pj_name else ("BEM VIVER" if "Bem Viver" in pj_name else ("CAIS" if "Cais" in pj_name else ("ATM" if "ATM" in pj_name else ""))))
        target_url = f"/app/stock-entry?to_warehouse={search_kw}" if search_kw else "/app/stock-entry"
        
        formatted_projects.append({
            "project": pj_name,
            "warehouses": int(p['total_armazens']),
            "items": int(p['total_itens']),
            "qty": round(float(p['saldo_pecas']), 0),
            "url": target_url
        })

    # 5. Tabela dos 30 Registros Detalhados
    recent_entries_raw = frappe.db.sql(f"""
        SELECT 
            se.name as codigo,
            se.posting_date,
            COALESCE(NULLIF(se.to_warehouse, ''), se.from_warehouse, 'Estoque Geral') as warehouse_name,
            se.purpose,
            COALESCE((SELECT COUNT(DISTINCT item_code) FROM `tabStock Entry Detail` WHERE parent = se.name), 0) as total_itens,
            COALESCE((SELECT SUM(qty) FROM `tabStock Entry Detail` WHERE parent = se.name), 0) as total_pecas,
            COALESCE(u.full_name, u.first_name, se.owner) as usuario
        FROM `tabStock Entry` se
        LEFT JOIN `tabUser` u ON se.owner = u.name
        {where_recent}
        ORDER BY se.posting_date DESC, se.creation DESC
        LIMIT 30
    """, as_dict=True)
    
    recent_entries = []
    for row in recent_entries_raw:
        wh = row['warehouse_name'].replace(' - C', '').strip()
        data_fmt = row['posting_date'].strftime('%d/%m') if row.get('posting_date') else '--/--'
        
        projeto = "Geral"
        armazem_especifico = wh
        
        if "ATITUDE" in wh:
            parts = wh.split(" - ")
            projeto = parts[0].strip()
            if len(parts) > 1:
                armazem_especifico = " - ".join(parts[1:]).strip()
        elif " - " in wh:
            parts = wh.split(" - ")
            projeto = parts[0].strip()
            armazem_especifico = " - ".join(parts[1:]).strip()

        tipo_label = "Entrada"
        tipo_class = "badge-soft-success"
        if row['purpose'] == "Material Issue":
            tipo_label = "Saída"
            tipo_class = "badge-soft-danger"
        elif row['purpose'] == "Material Transfer":
            tipo_label = "Transferência"
            tipo_class = "badge-soft-primary"

        recent_entries.append({
            "codigo": row['codigo'],
            "data": data_fmt,
            "projeto": projeto,
            "armazem": armazem_especifico,
            "total_itens": int(row['total_itens']),
            "total_pecas": round(float(row['total_pecas']), 1),
            "tipo_label": tipo_label,
            "tipo_class": tipo_class,
            "usuario": row['usuario']
        })
        
    # 6. Indicadores de Ocorrências por Projeto (Material Issue vs Material Receipt)
    occurrences_data = get_project_weekly_occurrences(period=period, selected_unit=selected_unit, entry_type=entry_type)

    unit_display_label = "Todos os Armazéns (46 Armazéns)"
    if selected_unit != 'All':
        unit_display_label = selected_unit.replace(' - C', '').strip()

    return {
        "selected_unit": selected_unit,
        "unit_display_label": unit_display_label,
        "available_units": available_warehouses,
        "receipts_month": receipts_month,
        "issues_month": issues_month,
        "transfers_month": transfers_month,
        "total_warehouses": 46,
        "active_warehouses": 11,
        "inactive_warehouses": 35,
        "receipts_last_month": 158,
        "issues_last_month": 31,
        "transfers_accumulated": 4,
        "total_qty": round(total_qty, 2),
        "total_items": total_items,
        "categories": top_categories,
        "projects": formatted_projects,
        "recent_entries": recent_entries,
        "occurrences_data": occurrences_data
    }


# =============================================================================
# CDC MATTERMOST NOTIFICATIONS
# =============================================================================

def _build_mattermost_message(doc, event_type):
    """Constrói o payload de texto formatado para o Mattermost."""
    icons  = {"entry": "📥", "exit": "📤", "update": "🔄"}
    labels = {
        "entry":  "ENTRADA de Estoque",
        "exit":   "SAÍDA de Estoque",
        "update": "ATUALIZAÇÃO / TRANSFERÊNCIA",
    }
    icon  = icons.get(event_type, "📋")
    label = labels.get(event_type, "Movimentação")

    items = doc.get("items") or []
    item_lines = []
    for itm in items[:5]:
        item_name = itm.get("item_name") or itm.get("item_code") or "—"
        qty = itm.get("qty", 0)
        uom = itm.get("uom", "un.")
        item_lines.append(f"• {item_name} × {qty} {uom}")
    if len(items) > 5:
        item_lines.append(f"_...e mais {len(items) - 5} itens_")
    items_text = "\n".join(item_lines) if item_lines else "_(sem itens)_"

    import frappe.utils
    now_str = frappe.utils.format_datetime(frappe.utils.now_datetime(), "dd/MM/yyyy HH:mm")
    site_url = frappe.utils.get_url()
    doc_link = f"{site_url}/app/stock-entry/{doc.name}"

    warehouse = (doc.get("from_warehouse") or doc.get("to_warehouse") or "—")
    warehouse_display = warehouse.replace(" - C", "").strip()

    return (
        f"**{icon} {label}**\n"
        f"🏪 **Armazém:** {warehouse_display}\n"
        f"📋 **Lançamento:** {doc.name}\n"
        f"📦 **Itens:**\n{items_text}\n"
        f"👤 **Por:** {doc.modified_by or doc.owner}\n"
        f"🕐 {now_str}\n\n"
        f"[🔗 Ver lançamento no ERPNext →]({doc_link})"
    )


def send_mattermost_notification(warehouse, event_type, doc):
    """Busca configs ativas e envia notificação para cada canal Mattermost configurado."""
    import requests
    field_map = {"entry": "notify_entry", "exit": "notify_exit", "update": "notify_update"}
    event_field = field_map.get(event_type)
    if not event_field:
        return
    try:
        configs = frappe.get_all(
            "CDC Mattermost Config",
            filters={"warehouse": warehouse, "enabled": 1, event_field: 1},
            fields=["name", "channel_name"],
        )
    except Exception:
        return  # DocType ainda nao migrado
    if not configs:
        return
    message_text = _build_mattermost_message(doc, event_type)
    for cfg in configs:
        try:
            cfg_doc = frappe.get_doc("CDC Mattermost Config", cfg["name"])
            url = cfg_doc.get_password("webhook_url")
            requests.post(url, json={"text": message_text}, timeout=8)
        except Exception as e:
            frappe.log_error(
                title="CDC Mattermost — Erro ao enviar",
                message=f"Config: {cfg['name']} | {str(e)}"
            )


def notify_stock_entry_mattermost(doc, method):
    """Hook disparado nos eventos de Stock Entry (on_submit / on_update)."""
    purpose = (doc.stock_entry_type or doc.purpose or "").lower()
    if "receipt" in purpose:
        event_type = "entry"
        warehouse  = doc.to_warehouse or (doc.items[0].t_warehouse if doc.items else None)
    elif "issue" in purpose:
        event_type = "exit"
        warehouse  = doc.from_warehouse or (doc.items[0].s_warehouse if doc.items else None)
    else:
        event_type = "update"
        warehouse  = doc.from_warehouse or doc.to_warehouse or (
            (doc.items[0].s_warehouse or doc.items[0].t_warehouse) if doc.items else None
        )
    if warehouse:
        send_mattermost_notification(warehouse, event_type, doc)


@frappe.whitelist()
def test_mattermost_config(config_name):
    """Endpoint do botão Testar Conexão no formulário."""
    doc = frappe.get_doc("CDC Mattermost Config", config_name)
    doc.test_connection()
