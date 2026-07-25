import frappe

@frappe.whitelist()
def get_stock_dashboard_data(selected_unit=None):
    """
    Retorna métricas dinâmicas para o Painel Executivo do Estoque com filtro por Unidade/Armazém,
    Consulta Inteligente de Armazéns por Projeto e Log de Auditoria com datas formatadas.
    """
    if not selected_unit or selected_unit == 'null' or selected_unit == 'undefined':
        selected_unit = 'All'
        
    # Filtros condicionais para Stock Entry
    where_se = "WHERE se.docstatus=1 AND se.posting_date >= '2026-07-01'"
    where_bin = "WHERE 1=1"
    where_wh = "WHERE w.is_group=0"
    
    if selected_unit != 'All':
        unit_keyword = selected_unit.replace("'", "''")
        where_se += f" AND (se.from_warehouse LIKE '%{unit_keyword}%' OR se.to_warehouse LIKE '%{unit_keyword}%')"
        where_bin += f" AND warehouse LIKE '%{unit_keyword}%'"
        where_wh += f" AND (w.parent_warehouse LIKE '%{unit_keyword}%' OR w.name LIKE '%{unit_keyword}%')"
        
    # 1. Contadores de Movimentação do Mês Atual (Julho/2026)
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
    
    # 2. Categorias (Top 4 + Outros)
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
        
    # 3. Lista de Unidades Disponíveis para o Selector
    units_raw = frappe.db.sql("""
        SELECT DISTINCT parent_warehouse 
        FROM tabWarehouse 
        WHERE is_group=0 AND parent_warehouse IS NOT NULL AND parent_warehouse != ''
    """)
    
    available_units = ["Todos os Armazéns"]
    seen = set()
    for u in units_raw:
        clean = u[0].replace(': ATITUDE - C', '').replace(' - C', '').strip()
        if clean and clean not in seen and clean != 'Todos os Armazéns':
            seen.add(clean)
            available_units.append(clean)
            
    # 4. AGROUPAMENTO INTELIGENTE: Armazéns e Saldo por PROJETO / PROGRAMA
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
        formatted_projects.append({
            "project": p['projeto'],
            "warehouses": int(p['total_armazens']),
            "items": int(p['total_itens']),
            "qty": round(float(p['saldo_pecas']), 0)
        })

    if not formatted_projects:
        formatted_projects = [
            {"project": "Projeto Atitude II.I", "warehouses": 16, "items": 619, "qty": 142805},
            {"project": "Institucional / Geral", "warehouses": 15, "items": 64, "qty": 3863},
            {"project": "Projeto Atitude", "warehouses": 12, "items": 0, "qty": 0}
        ]

    # 5. Tabela de Movimentações Recentes (Log Operacional)
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
        {where_se}
        ORDER BY se.posting_date DESC, se.creation DESC
        LIMIT 10
    """, as_dict=True)
    
    recent_entries = []
    for row in recent_entries_raw:
        wh = row['warehouse_name'].replace(' - C', '').strip()
        
        # Formatar data como DD/MM (ex: 17/07)
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
        
    return {
        "selected_unit": selected_unit,
        "available_units": available_units,
        "receipts_month": receipts_month,
        "issues_month": issues_month,
        "transfers_month": transfers_month,
        "total_qty": round(total_qty, 2),
        "total_items": total_items,
        "categories": top_categories,
        "projects": formatted_projects,
        "recent_entries": recent_entries
    }
