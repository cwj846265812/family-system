"""
健康路由 — 打卡/检查/报告/生理期
"""
import json
from datetime import datetime, date, timedelta
from flask import Blueprint, request, jsonify

health_bp = Blueprint('health', __name__)


def safe_parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except ValueError:
        if len(val) == 7 and '-' in val:
            return date.fromisoformat(val + '-01')
        raise


# ============================================================
# 打卡记录 (CheckIn)
# ============================================================

@health_bp.route('/api/health/checkins/<int:member_id>', methods=['GET'])
def get_checkins(member_id):
    """查询打卡记录，支持 ?type=&date="""
    try:
        from app import db
        from models import CheckIn

        query = db.session.query(CheckIn).filter(CheckIn.member_id == member_id)

        # 可选过滤
        checkin_type = request.args.get('type')
        checkin_date = request.args.get('date')

        if checkin_type:
            query = query.filter(CheckIn.type == checkin_type)
        if checkin_date:
            query = query.filter(CheckIn.date == checkin_date)

        records = query.order_by(CheckIn.date.desc(), CheckIn.created_at.desc()).limit(200).all()

        result = []
        for r in records:
            val = r.get_value()
            result.append({
                'id': r.id,
                'member_id': r.member_id,
                'type': r.type,
                'date': r.date.isoformat(),
                'value': val,
                'notes': r.notes,
                'created_at': r.created_at.isoformat() if r.created_at else None
            })

        return jsonify({'checkins': result, 'count': len(result)})

    except Exception as e:
        print(f"[Health] Get checkins error: {e}")
        return jsonify({'error': str(e)}), 500


@health_bp.route('/api/health/checkins', methods=['POST'])
def create_checkin():
    """创建/更新打卡记录（同类型同日期 upsert）"""
    try:
        from app import db
        from models import CheckIn

        data = request.get_json()
        member_id = data.get('member_id')
        checkin_type = data.get('type')
        checkin_date = data.get('date', date.today().isoformat())

        # Upsert: 同类型同日期 → 更新
        existing = db.session.query(CheckIn).filter(
            CheckIn.member_id == member_id,
            CheckIn.type == checkin_type,
            CheckIn.date == checkin_date
        ).first()

        value = data.get('value')
        if isinstance(value, (dict, list)):
            value = json.dumps(value, ensure_ascii=False)

        if existing:
            existing.value = value
            existing.notes = data.get('notes', existing.notes)
            db.session.commit()
            print(f"[Health] Checkin updated: id={existing.id}, member={member_id}, type={checkin_type}, date={checkin_date}")
            return jsonify({'message': '打卡记录已保存', 'id': existing.id})
        else:
            record = CheckIn(
                member_id=member_id,
                type=checkin_type,
                date=safe_parse_date(checkin_date) if isinstance(checkin_date, str) else checkin_date,
                value=value,
                notes=data.get('notes', '')
            )
            db.session.add(record)
            db.session.commit()
            print(f"[Health] Checkin created: id={record.id}, member={member_id}, type={checkin_type}, date={checkin_date}")
            return jsonify({'message': '打卡记录已保存', 'id': record.id})

    except Exception as e:
        print(f"[Health] Create checkin error: {e}")
        return jsonify({'error': str(e)}), 500


@health_bp.route('/api/health/checkins/item/<int:checkin_id>', methods=['PUT'])
def update_checkin(checkin_id):
    """更新打卡记录"""
    try:
        from app import db
        from models import CheckIn

        record = db.session.query(CheckIn).filter(CheckIn.id == checkin_id).first()
        if not record:
            return jsonify({'error': '记录不存在'}), 404

        data = request.get_json()
        if 'date' in data:
            record.date = safe_parse_date(data['date'])
        if 'type' in data:
            record.type = data['type']
        if 'value' in data:
            val = data['value']
            if isinstance(val, (dict, list)):
                val = json.dumps(val, ensure_ascii=False)
            record.value = val
        if 'notes' in data:
            record.notes = data['notes']

        db.session.commit()
        print(f"[Health] Checkin updated: id={checkin_id}")
        return jsonify({'message': '记录已更新', 'id': checkin_id})

    except Exception as e:
        print(f"[Health] Update checkin error: {e}")
        return jsonify({'error': str(e)}), 500


@health_bp.route('/api/health/checkins/item/<int:checkin_id>', methods=['DELETE'])
def delete_checkin(checkin_id):
    """删除打卡记录"""
    try:
        from app import db
        from models import CheckIn

        record = db.session.query(CheckIn).filter(CheckIn.id == checkin_id).first()
        if not record:
            return jsonify({'error': '记录不存在'}), 404

        db.session.delete(record)
        db.session.commit()
        print(f"[Health] Checkin deleted: id={checkin_id}")
        return jsonify({'message': '记录已删除', 'id': checkin_id})

    except Exception as e:
        print(f"[Health] Delete checkin error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# 检查项目 (HealthCheckItem)
# ============================================================

@health_bp.route('/api/health/checks/<int:member_id>', methods=['GET'])
def get_checks(member_id):
    """查询检查项目列表"""
    try:
        from app import db
        from models import HealthCheckItem

        records = db.session.query(HealthCheckItem).filter(
            HealthCheckItem.member_id == member_id
        ).order_by(HealthCheckItem.next_due_date.asc()).all()

        result = []
        for r in records:
            result.append({
                'id': r.id,
                'name': r.name,
                'category': r.category,
                'period_type': r.period_type,
                'last_check_date': r.last_check_date.isoformat() if r.last_check_date else None,
                'next_due_date': r.next_due_date.isoformat() if r.next_due_date else None,
                'is_abnormal': r.is_abnormal,
                'review_period_days': r.review_period_days
            })

        return jsonify({'checks': result, 'count': len(result)})

    except Exception as e:
        print(f"[Health] Get checks error: {e}")
        return jsonify({'error': str(e)}), 500


@health_bp.route('/api/health/checks', methods=['POST'])
def create_check():
    """创建检查项目"""
    try:
        from app import db
        from models import HealthCheckItem

        data = request.get_json()

        next_due = None
        last_check = None
        if data.get('last_check_date'):
            last_check = safe_parse_date(data['last_check_date'])
        if data.get('next_due_date'):
            next_due = safe_parse_date(data['next_due_date'])

        item = HealthCheckItem(
            member_id=data.get('member_id'),
            name=data.get('name'),
            category=data.get('category', 'physical'),
            period_type=data.get('period_type', 'once'),
            last_check_date=last_check,
            next_due_date=next_due,
            is_abnormal=data.get('is_abnormal', False),
            review_period_days=data.get('review_period_days')
        )
        db.session.add(item)
        db.session.commit()

        print(f"[Health] Check item created: {item.name}")
        return jsonify({'message': '检查项目已创建', 'id': item.id}), 201

    except Exception as e:
        print(f"[Health] Create check error: {e}")
        return jsonify({'error': str(e)}), 500


@health_bp.route('/api/health/checks/<int:check_id>', methods=['PUT'])
def update_check(check_id):
    """更新检查项目"""
    try:
        from app import db
        from models import HealthCheckItem

        item = db.session.query(HealthCheckItem).filter(
            HealthCheckItem.id == check_id
        ).first()

        if not item:
            return jsonify({'error': '检查项目不存在'}), 404

        data = request.get_json()
        if 'name' in data:
            item.name = data['name']
        if 'category' in data:
            item.category = data['category']
        if 'period_type' in data:
            item.period_type = data['period_type']
        if 'last_check_date' in data and data['last_check_date']:
            item.last_check_date = safe_parse_date(data['last_check_date'])
        if 'next_due_date' in data and data['next_due_date']:
            item.next_due_date = date.fromisoformat(data['next_due_date'])
        if 'is_abnormal' in data:
            item.is_abnormal = data['is_abnormal']
        if 'review_period_days' in data:
            item.review_period_days = data['review_period_days']

        db.session.commit()
        print(f"[Health] Check item updated: {item.name}")
        return jsonify({'message': '检查项目已更新'})

    except Exception as e:
        print(f"[Health] Update check error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# 体检报告 (HealthReport)
# ============================================================

@health_bp.route('/api/health/reports/<int:member_id>', methods=['GET'])
def get_reports(member_id):
    """查询报告列表"""
    try:
        from app import db
        from models import HealthReport

        records = db.session.query(HealthReport).filter(
            HealthReport.member_id == member_id
        ).order_by(HealthReport.report_date.desc()).all()

        result = []
        for r in records:
            result.append({
                'id': r.id,
                'title': r.title,
                'report_date': r.report_date.isoformat() if r.report_date else None,
                'file_path': r.file_path,
                'notes': r.notes
            })

        return jsonify({'reports': result, 'count': len(result)})

    except Exception as e:
        print(f"[Health] Get reports error: {e}")
        return jsonify({'error': str(e)}), 500


@health_bp.route('/api/health/reports', methods=['POST'])
def create_report():
    """上传报告（暂存文件路径）"""
    try:
        from app import db
        from models import HealthReport

        data = request.get_json()
        report = HealthReport(
            member_id=data.get('member_id'),
            title=data.get('title'),
            report_date=safe_parse_date(data.get('report_date')) if data.get('report_date') else date.today(),
            file_path=data.get('file_path', ''),
            notes=data.get('notes', '')
        )
        db.session.add(report)
        db.session.commit()

        print(f"[Health] Report created: {report.title}")
        return jsonify({'message': '报告已上传', 'id': report.id}), 201

    except Exception as e:
        print(f"[Health] Create report error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# 生理期数据 (含BBT曲线、周期统计、预测)
# ============================================================

@health_bp.route('/api/health/period/<int:member_id>', methods=['GET'])
def get_period_data(member_id):
    """获取生理期数据（含BBT曲线、周期统计、预测）"""
    try:
        from app import db
        from models import CheckIn

        # BBT 数据（近90天）
        ninety_days_ago = date.today() - timedelta(days=90)
        bbt_records = db.session.query(CheckIn).filter(
            CheckIn.member_id == member_id,
            CheckIn.type == 'bbt',
            CheckIn.date >= ninety_days_ago
        ).order_by(CheckIn.date.asc()).all()

        bbt_data = []
        for r in bbt_records:
            val = r.get_value()
            temp = float(val.get('temperature', 0)) if isinstance(val, dict) else (float(val) if val else 0)
            bbt_data.append({
                'date': r.date.isoformat(),
                'temperature': temp
            })

        # 生理期起止记录
        menstrual_records = db.session.query(CheckIn).filter(
            CheckIn.member_id == member_id,
            CheckIn.type == 'menstrual'
        ).order_by(CheckIn.date.asc()).all()

        periods = []
        for r in menstrual_records:
            val = r.get_value() or {}
            periods.append({
                'id': r.id,
                'date': r.date.isoformat(),
                'start_date': val.get('start_date', r.date.isoformat()) if isinstance(val, dict) else r.date.isoformat(),
                'end_date': val.get('end_date', '') if isinstance(val, dict) else '',
                'flow': val.get('flow', '') if isinstance(val, dict) else '',
                'symptoms': val.get('symptoms', []) if isinstance(val, dict) else []
            })

        # 周期统计
        cycle_stats = _calculate_cycle_stats(periods)

        # 下次预测
        next_prediction = _predict_next_period(periods)

        return jsonify({
            'bbt_data': bbt_data,
            'periods': periods,
            'cycle_stats': cycle_stats,
            'next_prediction': next_prediction
        })

    except Exception as e:
        print(f"[Health] Get period data error: {e}")
        return jsonify({'error': str(e)}), 500


def _calculate_cycle_stats(periods):
    """计算周期统计"""
    if len(periods) < 2:
        return {'average_length': None, 'regularity': None, 'total_cycles': len(periods)}

    try:
        from datetime import datetime as dt

        dates = []
        for p in periods:
            d = p.get('start_date') or p.get('date')
            if d:
                dates.append(date.fromisoformat(d))
        dates.sort()

        cycle_lengths = []
        for i in range(1, len(dates)):
            diff = (dates[i] - dates[i - 1]).days
            if 20 <= diff <= 45:  # 过滤异常值
                cycle_lengths.append(diff)

        if not cycle_lengths:
            return {'average_length': None, 'regularity': None, 'total_cycles': len(periods)}

        avg = sum(cycle_lengths) / len(cycle_lengths)
        variance = sum((c - avg) ** 2 for c in cycle_lengths) / len(cycle_lengths)
        std = variance ** 0.5

        if std <= 2:
            regularity = '非常规律'
        elif std <= 4:
            regularity = '较规律'
        else:
            regularity = '不规律'

        return {
            'average_length': round(avg, 1),
            'standard_deviation': round(std, 1),
            'regularity': regularity,
            'total_cycles': len(periods)
        }
    except Exception:
        return {'average_length': None, 'regularity': None, 'total_cycles': len(periods)}


def _predict_next_period(periods):
    """预测下次生理期"""
    if not periods:
        return {'next_date': None, 'ovulation_date': None, 'fertile_window': None}

    try:
        from datetime import datetime as dt

        dates = []
        for p in periods:
            d = p.get('start_date') or p.get('date')
            if d:
                dates.append(date.fromisoformat(d))
        dates.sort()

        if len(dates) < 2:
            return {'next_date': None, 'ovulation_date': None, 'fertile_window': None}

        cycle_lengths = []
        for i in range(1, len(dates)):
            diff = (dates[i] - dates[i - 1]).days
            if 20 <= diff <= 45:
                cycle_lengths.append(diff)

        if not cycle_lengths:
            return {'next_date': None, 'ovulation_date': None, 'fertile_window': None}

        avg_cycle = sum(cycle_lengths) / len(cycle_lengths)
        last_period = dates[-1]
        next_date = last_period + timedelta(days=int(round(avg_cycle)))
        ovulation_date = next_date - timedelta(days=14)
        fertile_start = ovulation_date - timedelta(days=5)
        fertile_end = ovulation_date + timedelta(days=2)

        return {
            'next_date': next_date.isoformat(),
            'ovulation_date': ovulation_date.isoformat(),
            'fertile_window': {
                'start': fertile_start.isoformat(),
                'end': fertile_end.isoformat()
            }
        }
    except Exception:
        return {'next_date': None, 'ovulation_date': None, 'fertile_window': None}


# ---- 运动推荐 ----
EXERCISE_RECOMMENDATIONS = {
    'menstrual': {
        'recommend': [
            {'name': '散步', 'icon': 'walk', 'intensity': 'low', 'duration': '20-30分钟'},
            {'name': '温和瑜伽', 'icon': 'yoga', 'intensity': 'low', 'duration': '15-20分钟'},
            {'name': '拉伸放松', 'icon': 'stretch', 'intensity': 'low', 'duration': '10-15分钟'},
            {'name': '冥想呼吸', 'icon': 'meditation', 'intensity': 'low', 'duration': '10分钟'},
        ],
        'avoid': [
            '剧烈跑跳', 'HIIT', '大重量深蹲/硬拉', '倒立体式', '腹部核心强化', '冷水游泳'
        ],
        'tips': '经期注意保暖，避免受凉。运动以舒缓为主，如出现腹痛加剧应立即停止。可适当补充铁质和温热水。'
    },
    'follicular': {
        'recommend': [
            {'name': '跑步', 'icon': 'jog', 'intensity': 'high', 'duration': '20-40分钟'},
            {'name': 'HIIT训练', 'icon': 'hiit', 'intensity': 'high', 'duration': '15-25分钟'},
            {'name': '力量训练', 'icon': 'strength', 'intensity': 'high', 'duration': '30-45分钟'},
            {'name': '跳舞', 'icon': 'dance', 'intensity': 'medium', 'duration': '30-60分钟'},
            {'name': '搏击操', 'icon': 'boxing', 'intensity': 'high', 'duration': '20-30分钟'},
            {'name': '爬坡', 'icon': 'hike', 'intensity': 'medium', 'duration': '15-30分钟'},
        ],
        'avoid': [],
        'tips': '雌激素上升期，运动表现最佳！适合突破个人记录、尝试新运动。注意充分热身，补充蛋白质促进肌肉修复。'
    },
    'ovulatory': {
        'recommend': [
            {'name': '游泳', 'icon': 'swim', 'intensity': 'medium', 'duration': '30-45分钟'},
            {'name': '有氧操', 'icon': 'aerobic', 'intensity': 'medium', 'duration': '30-40分钟'},
            {'name': '团体球类', 'icon': 'ball', 'intensity': 'medium', 'duration': '40-60分钟'},
            {'name': '核心训练', 'icon': 'core', 'intensity': 'medium', 'duration': '15-25分钟'},
            {'name': '骑行', 'icon': 'bike', 'intensity': 'medium', 'duration': '30-60分钟'},
        ],
        'avoid': ['极限负重', '高温瑜伽', '过度憋气发力'],
        'tips': '受孕窗口期，保持心情愉悦。注意补水，避免高温环境运动。团体运动有助于释放压力。'
    },
    'luteal': {
        'recommend': [
            {'name': '普拉提', 'icon': 'pilates', 'intensity': 'low', 'duration': '30-40分钟'},
            {'name': '快走', 'icon': 'walk', 'intensity': 'low', 'duration': '30-45分钟'},
            {'name': '温和力量', 'icon': 'strength', 'intensity': 'low', 'duration': '20-30分钟'},
            {'name': '瑜伽（猫牛式/婴儿式）', 'icon': 'yoga', 'intensity': 'low', 'duration': '15-25分钟'},
            {'name': '泡沫轴放松', 'icon': 'foamroller', 'intensity': 'low', 'duration': '10-15分钟'},
        ],
        'avoid': ['高强度间歇', '长时间耐力跑', '大重量训练', '腹部挤压/扭转', '高温暴晒运动'],
        'tips': '黄体期体温升高，注意补水，运动前后充分热身放松。降低强度，以维持性训练为主，避免力竭。'
    },
}


def _get_exercise_phase(db, member_id):
    """获取当前生理周期阶段用于运动推荐，与 dashboard.calc_period_phase 逻辑一致"""
    from models import CheckIn

    records = db.session.query(CheckIn).filter(
        CheckIn.member_id == member_id,
        CheckIn.type == 'menstrual'
    ).order_by(CheckIn.date.desc()).all()

    if not records:
        return None

    latest = None
    for r in records:
        val = r.get_value()
        if isinstance(val, dict) and val.get('start_date'):
            latest = val
            break

    if not latest:
        return None

    try:
        start_date = date.fromisoformat(latest['start_date'])
    except (ValueError, TypeError):
        return None

    today = date.today()
    day_in_cycle = (today - start_date).days + 1
    if day_in_cycle < 1:
        day_in_cycle = 1

    if day_in_cycle <= 5:
        phase = 'menstrual'
        phase_name = '月经期'
    elif day_in_cycle <= 10:
        phase = 'follicular'
        phase_name = '卵泡期'
    elif day_in_cycle <= 16:
        phase = 'ovulatory'
        phase_name = '排卵期'
    elif day_in_cycle <= 28:
        phase = 'luteal'
        phase_name = '黄体期'
    else:
        phase = 'luteal'
        phase_name = '黄体期（延后）'
        day_in_cycle = min(day_in_cycle, 40)

    next_predicted = start_date + timedelta(days=28)

    return {
        'phase': phase,
        'phase_name': phase_name,
        'day_in_cycle': day_in_cycle,
        'next_predicted': next_predicted.isoformat()
    }


@health_bp.route('/api/health/exercise/recommendations/<int:member_id>', methods=['GET'])
def get_exercise_recommendations(member_id):
    """根据生理周期阶段返回运动推荐和禁忌"""
    try:
        from app import db

        phase_info = _get_exercise_phase(db, member_id)

        if phase_info is None:
            return jsonify({
                'has_data': False,
                'message': '暂无经期数据，请在健康模块录入经期记录后获取个性化运动推荐',
                'recommendations': [],
                'avoid': [],
                'tips': '建议保持每周至少150分钟中等强度运动，结合力量训练。'
            })

        phase = phase_info['phase']
        rec = EXERCISE_RECOMMENDATIONS.get(phase, EXERCISE_RECOMMENDATIONS['luteal'])

        return jsonify({
            'has_data': True,
            'phase': phase_info['phase_name'],
            'phase_key': phase,
            'phase_day': phase_info['day_in_cycle'],
            'today': date.today().isoformat(),
            'next_predicted': phase_info['next_predicted'],
            'recommendations': rec['recommend'],
            'avoid': rec['avoid'],
            'tips': rec['tips']
        })

    except Exception as e:
        print(f"[Health] Get exercise recommendations error: {e}")
        return jsonify({'error': str(e)}), 500
