"""
物品路由 — 洗护产品 CRUD + 筛选
"""
from datetime import datetime, date
from flask import Blueprint, request, jsonify

items_bp = Blueprint('items', __name__)


def safe_parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except ValueError:
        if len(val) == 7 and '-' in val:
            return date.fromisoformat(val + '-01')
        raise


@items_bp.route('/api/items/<int:member_id>', methods=['GET'])
def get_items(member_id):
    """获取物品列表，支持 ?category=&risk_level=&status="""
    try:
        from app import db
        from models import ItemProduct

        query = db.session.query(ItemProduct).filter(ItemProduct.member_id == member_id)

        category = request.args.get('category')
        risk_level = request.args.get('risk_level')
        status = request.args.get('status')

        if category:
            query = query.filter(ItemProduct.category == category)
        if risk_level:
            query = query.filter(ItemProduct.risk_level == risk_level)
        if status:
            query = query.filter(ItemProduct.status == status)

        records = query.order_by(ItemProduct.expiry_date.asc()).all()

        result = []
        for r in records:
            result.append({
                'id': r.id,
                'member_id': r.member_id,
                'name': r.name,
                'category': r.category,
                'purchase_date': r.purchase_date.isoformat() if r.purchase_date else None,
                'expiry_date': r.expiry_date.isoformat() if r.expiry_date else None,
                'open_date': r.open_date.isoformat() if r.open_date else None,
                'pao_months': r.pao_months,
                'risk_level': r.risk_level,
                'status': r.status,
                'notes': r.notes
            })

        return jsonify({'items': result, 'count': len(result)})

    except Exception as e:
        print(f"[Items] Get items error: {e}")
        return jsonify({'error': str(e)}), 500


@items_bp.route('/api/items', methods=['POST'])
def create_item():
    """创建物品"""
    try:
        from app import db
        from models import ItemProduct

        data = request.get_json()

        purchase_date = None
        expiry_date = None
        open_date = None
        if data.get('purchase_date'):
            purchase_date = safe_parse_date(data['purchase_date'])
        if data.get('expiry_date'):
            expiry_date = safe_parse_date(data['expiry_date'])
        if data.get('open_date'):
            open_date = safe_parse_date(data['open_date'])

        item = ItemProduct(
            member_id=data.get('member_id'),
            name=data.get('name'),
            category=data.get('category', 'other'),
            purchase_date=purchase_date,
            expiry_date=expiry_date,
            open_date=open_date,
            pao_months=data.get('pao_months'),
            risk_level=data.get('risk_level', 'safe'),
            status=data.get('status', 'in_use'),
            notes=data.get('notes', '')
        )
        db.session.add(item)
        db.session.commit()

        print(f"[Items] Item created: {item.name} (id={item.id})")
        return jsonify({'message': '物品已创建', 'id': item.id}), 201

    except Exception as e:
        print(f"[Items] Create item error: {e}")
        return jsonify({'error': str(e)}), 500


@items_bp.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    """更新物品"""
    try:
        from app import db
        from models import ItemProduct

        item = db.session.query(ItemProduct).filter(
            ItemProduct.id == item_id
        ).first()

        if not item:
            return jsonify({'error': '物品不存在'}), 404

        data = request.get_json()
        if 'name' in data:
            item.name = data['name']
        if 'category' in data:
            item.category = data['category']
        if 'purchase_date' in data:
            item.purchase_date = safe_parse_date(data['purchase_date']) if data['purchase_date'] else None
        if 'expiry_date' in data:
            item.expiry_date = safe_parse_date(data['expiry_date']) if data['expiry_date'] else None
        if 'open_date' in data:
            item.open_date = safe_parse_date(data['open_date']) if data['open_date'] else None
        if 'pao_months' in data:
            item.pao_months = data['pao_months']
        if 'risk_level' in data:
            item.risk_level = data['risk_level']
        if 'status' in data:
            item.status = data['status']
        if 'notes' in data:
            item.notes = data['notes']

        db.session.commit()
        print(f"[Items] Item updated: {item.name}")
        return jsonify({'message': '物品已更新'})

    except Exception as e:
        print(f"[Items] Update item error: {e}")
        return jsonify({'error': str(e)}), 500


@items_bp.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    """删除物品"""
    try:
        from app import db
        from models import ItemProduct

        item = db.session.query(ItemProduct).filter(
            ItemProduct.id == item_id
        ).first()

        if not item:
            return jsonify({'error': '物品不存在'}), 404

        db.session.delete(item)
        db.session.commit()

        print(f"[Items] Item deleted: {item.name} (id={item.id})")
        return jsonify({'message': f'物品 {item.name} 已删除'})

    except Exception as e:
        print(f"[Items] Delete item error: {e}")
        return jsonify({'error': str(e)}), 500
