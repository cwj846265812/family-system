"""
孕产育路由 — 备孕计划/待办/阶段/确认怀孕
"""
from datetime import datetime, date
from flask import Blueprint, request, jsonify

pregnancy_bp = Blueprint('pregnancy', __name__)


def safe_parse_date(val):
    """安全解析日期，兼容 '2027-03' 格式"""
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except ValueError:
        if isinstance(val, str) and len(val) == 7 and '-' in val:
            return date.fromisoformat(val + '-01')
        raise


# ============================================================
# 备孕计划
# ============================================================

@pregnancy_bp.route('/api/pregnancy/plan/<int:member_id>', methods=['GET'])
def get_plan(member_id):
    """获取备孕计划"""
    try:
        from app import db
        from models import PregnancyPlan

        plan = db.session.query(PregnancyPlan).filter(
            PregnancyPlan.member_id == member_id
        ).first()

        if not plan:
            return jsonify({
                'member_id': member_id,
                'planned_date': None,
                'confirmed_date': None,
                'stage': 'inactive'
            })

        return jsonify({
            'id': plan.id,
            'member_id': plan.member_id,
            'planned_date': plan.planned_date.isoformat() if plan.planned_date else None,
            'confirmed_date': plan.confirmed_date.isoformat() if plan.confirmed_date else None,
            'stage': plan.stage or 'inactive'
        })

    except Exception as e:
        print(f"[Pregnancy] Get plan error: {e}")
        return jsonify({'error': str(e)}), 500


@pregnancy_bp.route('/api/pregnancy/plan/<int:member_id>', methods=['PUT'])
def update_plan(member_id):
    """更新 planned_date / confirmed_date"""
    try:
        from app import db
        from models import PregnancyPlan

        data = request.get_json()
        plan = db.session.query(PregnancyPlan).filter(
            PregnancyPlan.member_id == member_id
        ).first()

        if not plan:
            plan = PregnancyPlan(
                member_id=member_id,
                planned_date=safe_parse_date(data.get('planned_date')),
                stage='prep'
            )
            db.session.add(plan)
        else:
            if 'planned_date' in data and data['planned_date']:
                plan.planned_date = safe_parse_date(data['planned_date'])
                if not plan.stage or plan.stage == 'inactive':
                    plan.stage = 'prep'
            if 'confirmed_date' in data and data['confirmed_date']:
                plan.confirmed_date = safe_parse_date(data['confirmed_date'])

        db.session.commit()
        print(f"[Pregnancy] Plan updated for member {member_id}")
        return jsonify({'message': '备孕计划已更新', 'stage': plan.stage})

    except Exception as e:
        print(f"[Pregnancy] Update plan error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# 备孕相关待办
# ============================================================

@pregnancy_bp.route('/api/pregnancy/todos/<int:member_id>', methods=['GET'])
def get_pregnancy_todos(member_id):
    """获取备孕相关待办"""
    try:
        from app import db
        from models import TodoItem

        todos = db.session.query(TodoItem).filter(
            TodoItem.member_id == member_id,
            TodoItem.category.in_(['pregnancy', 'health']),
            TodoItem.source_engine == 'time_driver'
        ).order_by(TodoItem.due_date.asc()).all()

        result = []
        for t in todos:
            result.append({
                'id': t.id,
                'title': t.title,
                'category': t.category,
                'due_date': t.due_date.isoformat() if t.due_date else None,
                'status': t.status,
                'completed_at': t.completed_at.isoformat() if t.completed_at else None
            })

        return jsonify({'todos': result, 'count': len(result)})

    except Exception as e:
        print(f"[Pregnancy] Get todos error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# 当前阶段详情
# ============================================================

@pregnancy_bp.route('/api/pregnancy/stage/<int:member_id>', methods=['GET'])
def get_stage_detail(member_id):
    """获取当前阶段详情"""
    try:
        from app import db
        from engine.time_driver import TimeDriver

        driver = TimeDriver(db)
        stage_info = driver.get_stage(member_id)
        health_tag_todos = driver.get_health_tag_todos(member_id)

        return jsonify({
            'member_id': member_id,
            'stage_info': stage_info,
            'health_tag_todos': health_tag_todos
        })

    except Exception as e:
        print(f"[Pregnancy] Get stage error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# 确认怀孕
# ============================================================

@pregnancy_bp.route('/api/pregnancy/confirm', methods=['POST'])
def confirm_pregnancy():
    """确认怀孕（设置 confirmed_date + 触发级联）"""
    try:
        from app import db
        from engine.time_driver import TimeDriver

        data = request.get_json()
        member_id = data.get('member_id')
        confirmed_date = safe_parse_date(data.get('confirmed_date'))

        driver = TimeDriver(db)
        driver.on_confirmed(member_id, confirmed_date)

        print(f"[Pregnancy] Pregnancy confirmed for member {member_id}, date={confirmed_date}")
        return jsonify({
            'message': '确认怀孕成功，系统已切换至孕期模式',
            'member_id': member_id,
            'confirmed_date': confirmed_date.isoformat()
        })

    except Exception as e:
        print(f"[Pregnancy] Confirm pregnancy error: {e}")
        return jsonify({'error': str(e)}), 500
