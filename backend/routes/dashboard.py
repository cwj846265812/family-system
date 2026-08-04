"""
仪表板路由 — 聚合展示：阶段/待办/打卡/健康摘要/检查进度/备孕评分
"""
import json
from datetime import datetime, date, timedelta
from flask import Blueprint, request, jsonify

dashboard_bp = Blueprint('dashboard', __name__)


def calc_period_phase(db, member_id):
    """
    根据经期记录推断当前生理周期阶段。
    返回: dict {phase, phase_name, phase_desc, day_in_cycle, next_predicted}
    """
    from models import CheckIn

    records = db.session.query(CheckIn).filter(
        CheckIn.member_id == member_id,
        CheckIn.type == 'menstrual'
    ).order_by(CheckIn.date.desc()).all()

    if not records:
        return {
            'phase': 'unknown',
            'phase_name': '暂无经期数据',
            'phase_desc': '请在健康模块录入经期记录',
            'day_in_cycle': None,
            'next_predicted': None
        }

    # 解析最近一次经期的 start_date
    latest = None
    for r in records:
        val = r.get_value()
        if isinstance(val, dict) and val.get('start_date'):
            latest = val
            break

    if not latest:
        return {
            'phase': 'unknown',
            'phase_name': '暂无经期数据',
            'phase_desc': '请在健康模块录入经期记录',
            'day_in_cycle': None,
            'next_predicted': None
        }

    try:
        start_date = date.fromisoformat(latest['start_date'])
    except (ValueError, TypeError):
        return {
            'phase': 'unknown',
            'phase_name': '暂无经期数据',
            'phase_desc': '经期数据格式异常',
            'day_in_cycle': None,
            'next_predicted': None
        }

    today = date.today()
    day_in_cycle = (today - start_date).days + 1  # 1-based

    if day_in_cycle < 1:
        # 经期还没开始（记录是未来的）
        day_in_cycle = 1

    # 阶段划分：周期默认28天，经期5天
    if day_in_cycle <= 5:
        phase = 'menstrual'
        phase_name = '月经期'
        phase_desc = '注意保暖，避免剧烈运动，适当补充铁质'
    elif day_in_cycle <= 10:
        phase = 'follicular'
        phase_name = '卵泡期'
        phase_desc = '精力恢复期，适合中高强度运动，补充蛋白质'
    elif day_in_cycle <= 16:
        phase = 'ovulatory'
        phase_name = '排卵期'
        phase_desc = '受孕窗口期，保持心情愉悦，适度运动'
    elif day_in_cycle <= 28:
        phase = 'luteal'
        phase_name = '黄体期'
        phase_desc = '注意情绪管理，减少咖啡因，温和运动为宜'
    else:
        phase = 'luteal'
        phase_name = '黄体期（延后）'
        phase_desc = '周期超过28天，注意观察，如有不适及时就医'
        day_in_cycle = min(day_in_cycle, 40)  # cap display

    next_predicted = start_date + timedelta(days=28)

    return {
        'phase': phase,
        'phase_name': phase_name,
        'phase_desc': phase_desc,
        'day_in_cycle': day_in_cycle,
        'next_predicted': next_predicted.isoformat()
    }


@dashboard_bp.route('/api/dashboard/<int:member_id>', methods=['GET'])
def get_dashboard(member_id):
    """返回聚合仪表板数据"""
    try:
        from app import db
        from models import FamilyMember, TodoItem, CheckIn, HealthCheckItem, PregnancyPlan
        from engine.time_driver import TimeDriver
        from engine.identity_router import IdentityRouter

        driver = TimeDriver(db)
        router = IdentityRouter(db)

        today = date.today()

        # 阶段信息
        stage_info = driver.get_stage(member_id)

        # 未激活时增加 CTA 引导
        if stage_info.get('stage') == 'inactive':
            stage_info['cta'] = {'text': '设置备孕计划', 'link': '/pregnancy.html'}

        # 增加 today 和 period_phase
        stage_info['today'] = today.isoformat()
        stage_info['period_phase'] = calc_period_phase(db, member_id)

        # 今日待办
        todos = db.session.query(TodoItem).filter(
            TodoItem.member_id == member_id
        ).all()

        today_todos = []
        overdue_todos = []
        for t in todos:
            item = {
                'id': t.id,
                'title': t.title,
                'category': t.category,
                'due_date': t.due_date.isoformat() if t.due_date else None,
                'status': t.status,
                'source_engine': t.source_engine,
                'is_overdue': t.status == 'overdue' or (t.due_date and t.due_date < today and t.status == 'pending')
            }
            if item['is_overdue']:
                overdue_todos.append(item)
            else:
                today_todos.append(item)

        # 置于顶部：逾期项
        today_todos = overdue_todos + today_todos

        # 今日打卡项状态
        today_str = today.isoformat()
        active_checkins = driver.get_active_checkins(member_id)

        today_checkins = []
        for ch in active_checkins:
            record = db.session.query(CheckIn).filter(
                CheckIn.member_id == member_id,
                CheckIn.type == ch.get('type', ch.get('name', '')),
                CheckIn.date == today
            ).first()
            today_checkins.append({
                **ch,
                'done': record is not None,
                'value': record.value if record else None
            })

        # 最近7天感受摘要（mood打卡或health自评）
        seven_days_ago = today - timedelta(days=7)
        recent_checkins = db.session.query(CheckIn).filter(
            CheckIn.member_id == member_id,
            CheckIn.date >= seven_days_ago,
            CheckIn.type.in_(['mood', 'sleep', 'health_self'])
        ).order_by(CheckIn.date.desc()).all()

        health_summary = []
        for rc in recent_checkins:
            health_summary.append({
                'date': rc.date.isoformat(),
                'type': rc.type,
                'value': rc.value,
                'notes': rc.notes
            })

        # 检查进度环形图数据
        health_checks = db.session.query(HealthCheckItem).filter(
            HealthCheckItem.member_id == member_id
        ).all()

        total_checks = len(health_checks)
        done_checks = sum(1 for h in health_checks if h.last_check_date)
        overdue_checks = sum(1 for h in health_checks if h.next_due_date and h.next_due_date < today)

        check_progress = {
            'total': total_checks,
            'completed': done_checks,
            'overdue': overdue_checks,
            'pending': total_checks - done_checks
        }

        # 备孕准备度评分
        prep_score = driver.calculate_prep_score(member_id)

        return jsonify({
            'member_id': member_id,
            'stage_info': stage_info,
            'today_todos': today_todos,
            'today_checkins': today_checkins,
            'health_summary': health_summary,
            'check_progress': check_progress,
            'prep_score': prep_score
        })

    except Exception as e:
        print(f"[Dashboard] Error: {e}")
        return jsonify({'error': str(e)}), 500
