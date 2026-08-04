"""
财务模块路由 — 收支记录 CRUD + 月度统计
"""
from datetime import datetime, date
from flask import Blueprint, request, jsonify

finance_bp = Blueprint('finance', __name__)


@finance_bp.route('/api/finance/transactions', methods=['GET', 'POST'])
def transactions():
    from app import db
    from models import FinanceTransaction

    if request.method == 'GET':
        member_id = request.args.get('member_id', type=int)
        month = request.args.get('month')  # YYYY-MM
        category = request.args.get('category')
        trans_type = request.args.get('type')  # income/expense

        query = db.session.query(FinanceTransaction)
        if member_id:
            query = query.filter(FinanceTransaction.member_id == member_id)
        if month:
            query = query.filter(
                db.func.strftime('%Y-%m', FinanceTransaction.date) == month
            )
        if category:
            query = query.filter(FinanceTransaction.category == category)
        if trans_type:
            query = query.filter(FinanceTransaction.type == trans_type)

        records = query.order_by(FinanceTransaction.date.desc()).all()

        # 月度统计
        if member_id and month:
            income_total = db.session.query(
                db.func.coalesce(db.func.sum(FinanceTransaction.amount), 0)
            ).filter(
                FinanceTransaction.member_id == member_id,
                FinanceTransaction.type == 'income',
                db.func.strftime('%Y-%m', FinanceTransaction.date) == month
            ).scalar() or 0

            expense_total = db.session.query(
                db.func.coalesce(db.func.sum(FinanceTransaction.amount), 0)
            ).filter(
                FinanceTransaction.member_id == member_id,
                FinanceTransaction.type == 'expense',
                db.func.strftime('%Y-%m', FinanceTransaction.date) == month
            ).scalar() or 0

            # 分类统计
            category_stats_query = db.session.query(
                FinanceTransaction.category,
                db.func.sum(FinanceTransaction.amount).label('total')
            ).filter(
                FinanceTransaction.member_id == member_id,
                FinanceTransaction.type == 'expense',
                db.func.strftime('%Y-%m', FinanceTransaction.date) == month
            ).group_by(FinanceTransaction.category).all()

            category_stats = [
                {'category': row[0], 'total': round(row[1], 2)}
                for row in category_stats_query
            ]

            stats = {
                'income_total': round(income_total, 2),
                'expense_total': round(expense_total, 2),
                'balance': round(income_total - expense_total, 2),
                'category_stats': category_stats
            }
        else:
            stats = None

        return jsonify({
            'transactions': [r.to_dict() for r in records],
            'stats': stats,
            'count': len(records)
        })

    elif request.method == 'POST':
        data = request.get_json() or {}
        required = ['member_id', 'type', 'amount', 'category', 'date']
        for field in required:
            if field not in data:
                return jsonify({'error': f'缺少必填字段: {field}'}), 400

        try:
            trans_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return jsonify({'error': '日期格式应为 YYYY-MM-DD'}), 400

        tx = FinanceTransaction(
            member_id=data['member_id'],
            type=data['type'],
            amount=float(data['amount']),
            category=data['category'],
            date=trans_date,
            note=data.get('note', '')
        )
        db.session.add(tx)
        db.session.commit()

        return jsonify({'message': '记录已添加', 'transaction': tx.to_dict()}), 201
