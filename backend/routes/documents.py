"""
文档模块路由 — 文档记录 CRUD
"""
from datetime import datetime, date
from flask import Blueprint, request, jsonify

documents_bp = Blueprint('documents', __name__)


@documents_bp.route('/api/documents', methods=['GET', 'POST'])
def document_list():
    from app import db
    from models import Document

    if request.method == 'GET':
        member_id = request.args.get('member_id', type=int)
        category = request.args.get('category')

        query = db.session.query(Document)
        if member_id:
            query = query.filter(Document.member_id == member_id)
        if category:
            query = query.filter(Document.category == category)

        records = query.order_by(Document.doc_date.desc()).all()

        return jsonify({
            'documents': [r.to_dict() for r in records],
            'count': len(records)
        })

    elif request.method == 'POST':
        data = request.get_json() or {}
        required = ['member_id', 'name', 'category']
        for field in required:
            if field not in data:
                return jsonify({'error': f'缺少必填字段: {field}'}), 400

        doc_date = None
        if data.get('doc_date'):
            try:
                doc_date = datetime.strptime(data['doc_date'], '%Y-%m-%d').date()
            except (ValueError, TypeError):
                return jsonify({'error': '日期格式应为 YYYY-MM-DD'}), 400

        doc = Document(
            member_id=data['member_id'],
            name=data['name'],
            category=data.get('category', 'other'),
            file_path=data.get('file_path', ''),
            doc_date=doc_date,
            notes=data.get('notes', '')
        )
        db.session.add(doc)
        db.session.commit()

        return jsonify({'message': '文档记录已添加', 'document': doc.to_dict()}), 201


@documents_bp.route('/api/documents/<int:doc_id>', methods=['DELETE'])
def document_delete(doc_id):
    from app import db
    from models import Document

    doc = db.session.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        return jsonify({'error': '文档记录不存在'}), 404

    db.session.delete(doc)
    db.session.commit()

    return jsonify({'message': '文档记录已删除'})
