"""
时间驱动引擎 — TimeDriver (Singleton)
三个日期锚点 → 四阶段状态机 → 待办派生 → 全系统级联
"""
import os
import json
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta


class TimeDriver:
    """时间驱动引擎，单例模式"""

    _instance = None

    def __new__(cls, db_session=None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, db_session=None):
        if self._initialized and db_session is None:
            return
        self.db = db_session
        self._initialized = True

    # ============================================================
    # 阶段判定
    # ============================================================

    def get_stage(self, member_id):
        """
        根据 planned_date / confirmed_date / today 返回阶段。
        返回: dict {stage, stage_name, days_to_target, gestational_weeks}
        """
        from models import PregnancyPlan

        plan = self.db.session.query(PregnancyPlan).filter(
            PregnancyPlan.member_id == member_id
        ).first()

        today = date.today()

        if plan and plan.confirmed_date:
            # 孕期
            delta = today - plan.confirmed_date
            gestational_days = delta.days
            weeks = gestational_days // 7
            days_remainder = gestational_days % 7
            return {
                'stage': 'pregnancy',
                'stage_name': '孕期',
                'gestational_weeks': f"{weeks}周{days_remainder}天",
                'gestational_days': gestational_days,
                'confirmed_date': plan.confirmed_date.isoformat()
            }

        if not plan or not plan.planned_date:
            return {
                'stage': 'inactive',
                'stage_name': '未激活',
                'days_to_target': None
            }

        planned_date = plan.planned_date

        # 尝试期：今天 > planned_date 所在月最后一天
        try:
            month_end = (planned_date.replace(day=1) + relativedelta(months=1)) - timedelta(days=1)
        except Exception:
            month_end = planned_date

        if today > month_end:
            return {
                'stage': 'trying',
                'stage_name': '尝试期',
                'days_to_target': 0
            }

        days_diff = (planned_date - today).days

        if days_diff <= 90:
            return {
                'stage': 'spurt',
                'stage_name': '冲刺期',
                'days_to_target': days_diff
            }
        else:
            return {
                'stage': 'prep',
                'stage_name': '准备期',
                'days_to_target': days_diff
            }

    # ============================================================
    # 生成待办
    # ============================================================

    def generate_todos(self, member_id):
        """根据阶段和 health_tags 生成所有待办项"""
        from models import PregnancyPlan, FamilyMember, TodoItem

        plan = self.db.session.query(PregnancyPlan).filter(
            PregnancyPlan.member_id == member_id
        ).first()

        member = self.db.session.query(FamilyMember).filter(
            FamilyMember.id == member_id
        ).first()

        if not plan or not plan.planned_date:
            return []

        planned_date = plan.planned_date
        health_tags = member.get_health_tags() if member else []
        todos = []

        # 待办项映射表: (title, category, offset_days, condition_tags)
        todo_templates = []

        # 专项评估 (health_tags 触发)
        if 'breast_nodule' in health_tags:
            todo_templates.append(('乳腺超声复查 + 乳腺外科门诊', 'health', 150, ['breast_nodule']))
            # BI-RADS>=4 场景偏移 270 天
            todo_templates.append(('乳腺手术+恢复（BI-RADS≥4）', 'health', 270, ['breast_nodule_high']))
        if 'adenomyosis' in health_tags:
            todo_templates.append(('经阴道三维超声 + CA125 + 生殖内分泌科评估', 'health', 150, ['adenomyosis']))
            todo_templates.append(('GnRH-a 治疗（3-6针）', 'health', 180, ['adenomyosis_severe']))
        if 'pcos' in health_tags:
            todo_templates.append(('OGTT+IRT + 17-羟孕酮 + 内分泌/生殖科门诊', 'health', 150, ['pcos']))
            todo_templates.append(('减重至 BMI<24', 'health', 90, ['pcos_bmi']))

        # 通用待办
        todo_templates += [
            ('孕前检查（女方）', 'pregnancy', 90, []),
            ('孕前检查（男方）', 'pregnancy', 90, []),
            ('风疹疫苗补种', 'health', 90, []),
            ('乙肝疫苗第1针', 'health', 90, []),
            ('乙肝疫苗第2针', 'health', 60, []),
            ('口腔全面检查', 'health', 75, []),
            ('口腔治疗完成', 'health', 60, []),
            ('遗传咨询', 'health', 60, []),
            ('环境排查', 'health', 75, []),
            ('基础病复查/药物调整', 'health', 90, []),
            ('财务保险确认', 'finance', 60, []),
        ]

        existing_todos = {
            t.title: t for t in
            self.db.session.query(TodoItem).filter(
                TodoItem.member_id == member_id,
                TodoItem.source_engine == 'time_driver'
            ).all()
        }

        for title, category, offset_days, conditions in todo_templates:
            # 跳过不满足条件的模板
            if conditions and not any(c in health_tags for c in conditions):
                # 检查是否需要条件跳过（通用待办 conditions 为空，永远通过）
                if 'breast_nodule_high' in conditions and 'breast_nodule' not in health_tags:
                    continue
                if 'adenomyosis_severe' in conditions and 'adenomyosis' not in health_tags:
                    continue
                if 'pcos_bmi' in conditions and 'pcos' not in health_tags:
                    continue

            due_date = planned_date - timedelta(days=offset_days)

            if title in existing_todos:
                t = existing_todos[title]
                t.due_date = due_date  # update in case planned_date changed
                continue

            todo = TodoItem(
                member_id=member_id,
                title=title,
                category=category,
                due_date=due_date,
                status='pending',
                source_engine='time_driver'
            )
            self.db.session.add(todo)
            todos.append(todo)

        # 更新逾期状态
        today = date.today()
        all_todos = self.db.session.query(TodoItem).filter(
            TodoItem.member_id == member_id,
            TodoItem.status == 'pending'
        ).all()
        for t in all_todos:
            if t.due_date and t.due_date < today:
                t.status = 'overdue'

        self.db.session.commit()
        return todos

    # ============================================================
    # 获取活跃打卡项
    # ============================================================

    def get_active_checkins(self, member_id):
        """返回当前阶段应激活的打卡项列表"""
        from models import FamilyMember, CheckinChecklist

        member = self.db.session.query(FamilyMember).filter(
            FamilyMember.id == member_id
        ).first()
        stage_info = self.get_stage(member_id)
        stage = stage_info['stage']

        if stage == 'inactive':
            return []

        # 获取所有活跃打卡模板
        checklists = self.db.session.query(CheckinChecklist).filter(
            CheckinChecklist.is_active == True
        ).all()

        if not checklists:
            # 返回内置默认打卡项
            return self._default_checkins(stage, member)

        result = []
        for cl in checklists:
            if cl.applicable_gender and cl.applicable_gender != 'both':
                if member and member.gender != cl.applicable_gender:
                    continue
            result.append(cl.to_dict())

        return result

    def _default_checkins(self, stage, member):
        """内置默认打卡项列表"""
        items = []

        if stage in ('prep', 'spurt', 'trying'):
            items.append({
                'name': '女方叶酸', 'type': 'supplement', 'category': 'pregnancy',
                'applicable_gender': 'female', 'start': '冲刺期开始'
            })
            items.append({
                'name': '男方叶酸', 'type': 'supplement', 'category': 'pregnancy',
                'applicable_gender': 'male', 'start': '冲刺期开始'
            })

        if stage in ('spurt', 'trying'):
            items.append({
                'name': '基础体温(BBT)', 'type': 'bbt', 'category': 'health',
                'applicable_gender': 'female', 'start': '冲刺期开始(提前2个月积累)'
            })
            items.append({
                'name': '戒烟计数', 'type': 'smoking', 'category': 'pregnancy',
                'applicable_gender': 'both', 'start': '手动设定'
            })
            items.append({
                'name': '戒酒计数', 'type': 'alcohol', 'category': 'pregnancy',
                'applicable_gender': 'both', 'start': '手动设定'
            })
            items.append({
                'name': '咖啡因控制', 'type': 'caffeine', 'category': 'pregnancy',
                'applicable_gender': 'both', 'start': '冲刺期开始'
            })
            items.append({
                'name': '体重周记录', 'type': 'weight', 'category': 'health',
                'applicable_gender': 'both', 'start': '冲刺期开始'
            })
            items.append({
                'name': '运动打卡', 'type': 'motion', 'category': 'health',
                'applicable_gender': 'both', 'start': '手动开启'
            })

        if stage == 'trying':
            items.append({
                'name': '排卵试纸', 'type': 'ovulation_test', 'category': 'pregnancy',
                'applicable_gender': 'female', 'start': '尝试期排卵窗口'
            })
            items.append({
                'name': '同房记录', 'type': 'intercourse', 'category': 'health',
                'applicable_gender': 'female', 'start': '尝试期'
            })

        if stage == 'pregnancy':
            items.append({
                'name': '叶酸（孕期）', 'type': 'supplement', 'category': 'pregnancy',
                'applicable_gender': 'female', 'start': '持续至孕12周'
            })
            items.append({
                'name': '孕期体重记录', 'type': 'weight', 'category': 'health',
                'applicable_gender': 'female', 'start': '整个孕期'
            })
            items.append({
                'name': '孕期运动', 'type': 'motion', 'category': 'health',
                'applicable_gender': 'female', 'start': '整个孕期'
            })

        return items

    # ============================================================
    # 确认怀孕 — 全系统级联
    # ============================================================

    def on_confirmed(self, member_id, confirmed_date):
        """confirmed_date 设置后执行全系统级联"""
        from models import PregnancyPlan, TodoItem, FamilyMember

        plan = self.db.session.query(PregnancyPlan).filter(
            PregnancyPlan.member_id == member_id
        ).first()

        if not plan:
            return

        plan.confirmed_date = confirmed_date
        plan.stage = 'pregnancy'

        # 更新成员状态
        member = self.db.session.query(FamilyMember).filter(
            FamilyMember.id == member_id
        ).first()
        if member:
            member.active_stage = 'pregnancy'

        # 清理备孕待办
        self.db.session.query(TodoItem).filter(
            TodoItem.member_id == member_id,
            TodoItem.source_engine == 'time_driver',
            TodoItem.status.in_(['pending', 'overdue'])
        ).update({'status': 'done', 'completed_at': datetime.utcnow()}, synchronize_session=False)

        # 生成产检待办
        self._generate_pregnancy_todos(member_id, confirmed_date)

        self.db.session.commit()
        print(f"[TimeDriver] Confirmed pregnancy for member {member_id}, cascade complete.")

    def _generate_pregnancy_todos(self, member_id, confirmed_date):
        """基于 confirmed_date 生成产检时间表"""
        from models import TodoItem

        checkup_timeline = [
            ('NT检查 (11-13+6周)', 84),      # 12周
            ('早唐/中唐筛查 (15-20周)', 119),  # 17周
            ('大排畸超声 (20-24周)', 154),     # 22周
            ('糖耐量筛查 (24-28周)', 182),     # 26周
            ('小排畸超声 (28-32周)', 210),     # 30周
            ('GBS筛查 (35-37周)', 252),        # 36周
            ('产前评估 (37-40周)', 266),        # 38周
        ]

        for title, offset_days in checkup_timeline:
            due_date = confirmed_date + timedelta(days=offset_days)
            todo = TodoItem(
                member_id=member_id,
                title=title,
                category='pregnancy',
                due_date=due_date,
                status='pending',
                source_engine='time_driver'
            )
            self.db.session.add(todo)

    # ============================================================
    # 备孕准备度评分
    # ============================================================

    def calculate_prep_score(self, member_id):
        """计算备孕准备度评分"""
        from models import TodoItem, FamilyMember

        member = self.db.session.query(FamilyMember).filter(
            FamilyMember.id == member_id
        ).first()

        if not member:
            return {'score': 0, 'breakdown': {}}

        health_tags = member.get_health_tags()

        # 检查完成率 (weight 0.4)
        all_todos = self.db.session.query(TodoItem).filter(
            TodoItem.member_id == member_id,
            TodoItem.source_engine == 'time_driver'
        ).all()
        done_count = sum(1 for t in all_todos if t.status == 'done')
        total_count = len(all_todos) or 1
        check_rate = done_count / total_count

        # 打卡合规率 (weight 0.3) — 简化：从 checkins 近30天计算
        from models import CheckIn
        thirty_days_ago = date.today() - timedelta(days=30)
        checkins = self.db.session.query(CheckIn).filter(
            CheckIn.member_id == member_id,
            CheckIn.date >= thirty_days_ago
        ).all()
        compliance_rate = min(len(checkins) / 30.0, 1.0) if checkins else 0.0

        # BMI 达标 (weight 0.2) — 简化：默认达标
        bmi_ok = 1.0

        # 疫苗 (weight 0.1)
        vaccine_ok = 0.0

        # 动态调整权重
        if 'pcos' in health_tags:
            w_check, w_comply, w_bmi, w_vaccine = 0.35, 0.30, 0.35, 0.00
        elif 'adenomyosis' in health_tags:
            w_check, w_comply, w_bmi, w_vaccine = 0.30, 0.25, 0.15, 0.10
        else:
            w_check, w_comply, w_bmi, w_vaccine = 0.40, 0.30, 0.20, 0.10

        score = round(
            check_rate * w_check +
            compliance_rate * w_comply +
            bmi_ok * w_bmi +
            vaccine_ok * w_vaccine,
            2
        )

        return {
            'score': score,
            'breakdown': {
                'check_rate': round(check_rate, 2),
                'compliance_rate': round(compliance_rate, 2),
                'bmi_ok': bmi_ok,
                'vaccine_ok': vaccine_ok,
                'weights': {
                    'check': w_check,
                    'comply': w_comply,
                    'bmi': w_bmi,
                    'vaccine': w_vaccine
                }
            }
        }

    # ============================================================
    # health_tags 专项待办
    # ============================================================

    def get_health_tag_todos(self, member_id):
        """根据 health_tags 生成专项待办"""
        from models import FamilyMember

        member = self.db.session.query(FamilyMember).filter(
            FamilyMember.id == member_id
        ).first()
        if not member:
            return []

        health_tags = member.get_health_tags()
        result = []

        tag_todo_map = {
            'pcos': [
                'OGTT口服葡萄糖耐量试验 + IRT',
                '17-羟孕酮检测',
                '内分泌科 / 生殖科门诊',
                '生活方式干预启动（饮食+运动）'
            ],
            'adenomyosis': [
                '经阴道三维超声检查',
                '血清CA125检测',
                '生殖内分泌科评估（明确严重度和治疗方案）'
            ],
            'breast_nodule': [
                '乳腺超声复查（BI-RADS分级确认）',
                '乳腺外科门诊评估',
                '确认结节稳定后方可进入冲刺期'
            ]
        }

        for tag in health_tags:
            if tag in tag_todo_map:
                for item in tag_todo_map[tag]:
                    result.append({'tag': tag, 'title': item})

        return result
