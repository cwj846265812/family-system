"""
认证路由 — 成员管理与 JWT 登录
"""
import jwt
import hashlib
from datetime import datetime, timedelta, date
from flask import Blueprint, request, jsonify

auth_bp = Blueprint('auth', __name__)

SECRET_KEY = 'family-system-secret-key-2026'
TOKEN_EXPIRY_HOURS = 24


def safe_parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except ValueError:
        if len(val) == 7 and '-' in val:
            return date.fromisoformat(val + '-01')
        raise


def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


@auth_bp.route('/api/login', methods=['POST'])
def login():
    """用户登录：验证 name + password，返回 JWT token"""
    try:
        from app import db
        from models import FamilyMember

        data = request.get_json()
        name = data.get('name', '').strip()
        password = data.get('password', '')

        if not name or not password:
            return jsonify({'error': '请输入用户名和密码'}), 400

        password_hashed = hash_password(password)
        member = db.session.query(FamilyMember).filter(
            FamilyMember.name == name,
            FamilyMember.password_hash == password_hashed,
            FamilyMember.is_active == True
        ).first()

        if not member:
            return jsonify({'error': '用户名或密码错误'}), 401

        payload = {
            'member_id': member.id,
            'name': member.name,
            'role': member.role,
            'gender': member.gender,
            'exp': datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS)
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')

        print(f"[Auth] Login: name={name}, member_id={member.id}, role={member.role}")
        return jsonify({
            'token': token,
            'member_id': member.id,
            'name': member.name,
            'role': member.role,
            'gender': member.gender
        })

    except Exception as e:
        print(f"[Auth] Login error: {e}")
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/api/members', methods=['GET'])
def get_members():
    """返回所有活跃成员列表"""
    try:
        from app import db
        from models import FamilyMember

        members = db.session.query(FamilyMember).filter(
            FamilyMember.is_active == True
        ).all()

        result = []
        for m in members:
            result.append({
                'id': m.id,
                'name': m.name,
                'role': m.role,
                'gender': m.gender,
                'birth_date': m.birth_date.isoformat() if m.birth_date else None,
                'active_stage': m.active_stage,
                'health_tags': m.get_health_tags(),
                'is_active': m.is_active
            })
        return jsonify({'members': result, 'count': len(result)})

    except Exception as e:
        print(f"[Auth] Get members error: {e}")
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/api/members', methods=['POST'])
def create_member():
    """新增成员（仅 admin）"""
    try:
        from app import db
        from models import FamilyMember

        data = request.get_json()
        new_member = FamilyMember(
            name=data.get('name'),
            role=data.get('role', 'custom'),
            gender=data.get('gender', 'female'),
            birth_date=safe_parse_date(data.get('birth_date')),
            active_stage=data.get('active_stage', 'general'),
            health_tags=data.get('health_tags', '[]'),
            is_active=data.get('is_active', True)
        )
        db.session.add(new_member)
        db.session.commit()

        print(f"[Auth] Created member: {new_member.name} (id={new_member.id})")
        return jsonify({
            'message': '成员创建成功',
            'member': {
                'id': new_member.id,
                'name': new_member.name,
                'role': new_member.role
            }
        }), 201

    except Exception as e:
        print(f"[Auth] Create member error: {e}")
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/api/members/<int:member_id>', methods=['PUT'])
def update_member(member_id):
    """更新成员信息"""
    try:
        from app import db
        from models import FamilyMember

        member = db.session.query(FamilyMember).filter(
            FamilyMember.id == member_id
        ).first()

        if not member:
            return jsonify({'error': '成员不存在'}), 404

        data = request.get_json()
        if 'name' in data:
            member.name = data['name']
        if 'role' in data:
            member.role = data['role']
        if 'gender' in data:
            member.gender = data['gender']
        if 'birth_date' in data and data['birth_date']:
            member.birth_date = safe_parse_date(data['birth_date'])
        if 'health_tags' in data:
            if isinstance(data['health_tags'], list):
                import json
                member.health_tags = json.dumps(data['health_tags'], ensure_ascii=False)
            else:
                member.health_tags = data['health_tags']
        if 'is_active' in data:
            member.is_active = data['is_active']
        if 'active_stage' in data:
            member.active_stage = data['active_stage']

        db.session.commit()
        print(f"[Auth] Updated member: {member.name} (id={member.id})")
        return jsonify({'message': '成员信息更新成功', 'id': member.id})

    except Exception as e:
        print(f"[Auth] Update member error: {e}")
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/api/members/<int:member_id>', methods=['DELETE'])
def delete_member(member_id):
    """删除成员"""
    try:
        from app import db
        from models import FamilyMember

        member = db.session.query(FamilyMember).filter(
            FamilyMember.id == member_id
        ).first()

        if not member:
            return jsonify({'error': '成员不存在'}), 404

        if member.role == 'admin':
            return jsonify({'error': '不能删除管理员'}), 403

        db.session.delete(member)
        db.session.commit()

        print(f"[Auth] Deleted member: {member.name} (id={member.id})")
        return jsonify({'message': f'成员 {member.name} 已删除'})

    except Exception as e:
        print(f"[Auth] Delete member error: {e}")
        return jsonify({'error': str(e)}), 500
