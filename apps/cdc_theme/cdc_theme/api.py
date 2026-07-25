import frappe

@frappe.whitelist()
def get_stock_dashboard_data(selected_unit=None):
    """
    Retorna métricas dinâmicas para o Painel Executivo do Estoque com filtro por Unidade/Armazém,
    Agrupamento por Projeto e Log de Auditoria de Movimentações.
    """
    if not selected_unit or selected_unit == 'null' or selected_unit == 'undefined':
        selected_unit = 'All'
        
    # Filtros condicionais por Unidade
    where_se = "WHERE docstatus=1 AND posting_date >= '2026-07-01'"
    where_bin = "WHERE 1=1"
    where_wh = "WHERE is_group=0"
    
    if selected_unit != 'All':
        unit_keyword = selected_unit.replace("'", "''")
        where_se += f" AND (from_warehouse LIKE '%{unit_keyword}%' OR to_warehouse LIKE '%{unit_keyword}%')"
        where_bin += f" AND warehouse LIKE '%{unit_keyword}%'"
        where_wh += f" AND (parent_warehouse LIKE '%{unit_keyword}%' OR name LIKE '%{unit_keyword}%')"
        
    # 1. Contadores de Movimentação do Mês Atual
    receipts_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` {where_se} AND purpose='Material Receipt'")[0][0] or 0
    issues_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` {where_se} AND purpose='Material Issue'")[0][0] or 0
    transfers_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` {where_se} AND purpose='Material Transfer'")[0][0] or 0
    
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
            
    # 4. Agrupamento de Armazéns por PROJETO
    whs_query = frappe.db.sql(f"""
        SELECT name, parent_warehouse 
        FROM tabWarehouse 
        {where_wh}
    """, as_dict=True)
    
    projects_count = {}
    for w in whs_query:
        name = w['name'].replace(' - C', '').strip()
        proj = 'Institucional / Geral'
        if 'ATITUDE II.I' in name:
            proj = 'Projeto Atitude II.I'
        elif 'ATITUDE' in name:
            proj = 'Projeto Atitude'
        elif 'BEM VIVER' in name:
            proj = 'Projeto Bem Viver'
        elif 'CAIS' in name:
            proj = 'Projeto Cais'
        elif 'MORADIA' in name:
            proj = 'Projeto Moradia'
        elif 'ATM' in name:
            proj = 'Projeto ATM'
            
        projects_count[proj] = projects_count.get(proj, 0) + 1
        
    formatted_projects = []
    for proj_name, cnt in sorted(projects_count.items(), key=lambda x: x[1], reverse=True):
        formatted_projects.append({
            "project": proj_name,
            "warehouses": cnt
        })

    # 5. Tabela de Movimentações Recentes (Log Operacional)
    recent_entries_raw = frappe.db.sql(f"""
        SELECT 
            se.name as codigo,
            DATE_FORMAT(se.posting_date, '%%d/%%m') as data_postagem,
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
            "data": row['data_postagem'],
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
