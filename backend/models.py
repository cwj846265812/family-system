import os
import json
from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class FamilyMember(db.Model):
    __tablename__ = 'family_members'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(50), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='guest')  # admin/partner/child/elder/guest/custom
    gender = db.Column(db.String(10), nullable=False, default='female')  # male/female
    birth_date = db.Column(db.Date, nullable=True)
    password_hash = db.Column(db.String(128), nullable=True)  # SHA-256 hash
    active_stage = db.Column(db.String(30), nullable=True)  # pre_pregnancy/spurt/trying/pregnancy/postpartum/general
    health_tags = db.Column(db.Text, nullable=True)  # JSON string, e.g. ["pcos","adenomyosis"]
    permissions = db.Column(db.Text, nullable=True)  # JSON string
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # relationships
    checkins = db.relationship('CheckIn', backref='member', lazy='dynamic')
    todos = db.relationship('TodoItem', backref='member', lazy='dynamic')
    health_checks = db.relationship('HealthCheckItem', backref='member', lazy='dynamic')
    health_reports = db.relationship('HealthReport', backref='member', lazy='dynamic')
    pregnancy_plan = db.relationship('PregnancyPlan', backref='member', uselist=False, lazy=True)
    items = db.relationship('ItemProduct', backref='member', lazy='dynamic')
    budgets = db.relationship('BudgetRecord', backref='member', lazy='dynamic')

    def get_health_tags(self):
        if self.health_tags:
            try:
                return json.loads(self.health_tags)
            except (json.JSONDecodeError, TypeError):
                return []
        return []

    def get_permissions(self):
        if self.permissions:
            try:
                return json.loads(self.permissions)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'role': self.role,
            'gender': self.gender,
            'birth_date': self.birth_date.isoformat() if self.birth_date else None,
            'active_stage': self.active_stage,
            'health_tags': self.get_health_tags(),
            'permissions': self.get_permissions(),
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class CheckIn(db.Model):
    __tablename__ = 'checkins'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False)
    type = db.Column(db.String(30), nullable=False)  # menstrual/bbt/motion/diet/sleep/mood/supplement/alcohol/smoking/caffeine/weight/ovulation_test
    date = db.Column(db.Date, nullable=False)
    value = db.Column(db.Text, nullable=True)  # JSON string
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_value(self):
        if self.value:
            try:
                return json.loads(self.value)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'type': self.type,
            'date': self.date.isoformat() if self.date else None,
            'value': self.get_value(),
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class TodoItem(db.Model):
    __tablename__ = 'todo_items'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(30), nullable=False, default='health')  # health/pregnancy/item/finance
    due_date = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(20), nullable=False, default='pending')  # pending/done/ignored/overdue
    completed_at = db.Column(db.DateTime, nullable=True)
    source_engine = db.Column(db.String(30), nullable=True)  # time_driver/manual
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'title': self.title,
            'category': self.category,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'status': self.status,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'source_engine': self.source_engine,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class HealthCheckItem(db.Model):
    __tablename__ = 'health_check_items'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(30), nullable=False, default='physical')  # physical/gynecology/dental/ophthalmology
    period_type = db.Column(db.String(20), nullable=False, default='once')  # once/monthly/quarterly/yearly
    last_check_date = db.Column(db.Date, nullable=True)
    next_due_date = db.Column(db.Date, nullable=True)
    is_abnormal = db.Column(db.Boolean, default=False)
    review_period_days = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'name': self.name,
            'category': self.category,
            'period_type': self.period_type,
            'last_check_date': self.last_check_date.isoformat() if self.last_check_date else None,
            'next_due_date': self.next_due_date.isoformat() if self.next_due_date else None,
            'is_abnormal': self.is_abnormal,
            'review_period_days': self.review_period_days,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class HealthReport(db.Model):
    __tablename__ = 'health_reports'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    report_date = db.Column(db.Date, nullable=True)
    file_path = db.Column(db.String(500), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'title': self.title,
            'report_date': self.report_date.isoformat() if self.report_date else None,
            'file_path': self.file_path,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class PregnancyPlan(db.Model):
    __tablename__ = 'pregnancy_plans'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False, unique=True)
    planned_date = db.Column(db.Date, nullable=True)  # 计划怀孕日期（取当月第一天）
    confirmed_date = db.Column(db.Date, nullable=True)  # 确诊日期
    stage = db.Column(db.String(30), nullable=True)  # 计算字段: inactive/prep/spurt/trying/pregnancy
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'planned_date': self.planned_date.isoformat() if self.planned_date else None,
            'confirmed_date': self.confirmed_date.isoformat() if self.confirmed_date else None,
            'stage': self.stage,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class ItemProduct(db.Model):
    __tablename__ = 'item_products'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(30), nullable=False)  # cleanser/toner/serum/lotion/cream/sunscreen/mask/oil/balm/wash/foam/other
    purchase_date = db.Column(db.Date, nullable=True)
    expiry_date = db.Column(db.Date, nullable=True)
    open_date = db.Column(db.Date, nullable=True)
    pao_months = db.Column(db.Integer, nullable=True)  # 开封后保质期月数 (6/12/24)
    risk_level = db.Column(db.String(20), nullable=True, default='safe')  # safe/caution/avoid/banned
    status = db.Column(db.String(20), nullable=False, default='in_use')  # in_use/idle/pending_dispose/discarded
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'name': self.name,
            'category': self.category,
            'purchase_date': self.purchase_date.isoformat() if self.purchase_date else None,
            'expiry_date': self.expiry_date.isoformat() if self.expiry_date else None,
            'open_date': self.open_date.isoformat() if self.open_date else None,
            'pao_months': self.pao_months,
            'risk_level': self.risk_level,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class CheckinChecklist(db.Model):
    __tablename__ = 'checkin_checklists'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(30), nullable=False)  # health/pregnancy
    applicable_role = db.Column(db.String(50), nullable=True)  # admin/partner (comma separated)
    applicable_gender = db.Column(db.String(10), nullable=True)  # male/female/both
    start_condition_desc = db.Column(db.Text, nullable=True)
    end_condition_desc = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'applicable_role': self.applicable_role,
            'applicable_gender': self.applicable_gender,
            'start_condition_desc': self.start_condition_desc,
            'end_condition_desc': self.end_condition_desc,
            'is_active': self.is_active
        }


class BudgetRecord(db.Model):
    __tablename__ = 'budget_records'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0.0)
    month = db.Column(db.String(7), nullable=False)  # YYYY-MM
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'category': self.category,
            'amount': self.amount,
            'month': self.month,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class FinanceTransaction(db.Model):
    __tablename__ = 'finance_transactions'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False)
    type = db.Column(db.String(10), nullable=False, default='expense')  # income / expense
    amount = db.Column(db.Float, nullable=False, default=0.0)
    category = db.Column(db.String(50), nullable=False)  # 餐饮/交通/医疗/购物/教育/居住/其他
    date = db.Column(db.Date, nullable=False)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'type': self.type,
            'amount': self.amount,
            'category': self.category,
            'date': self.date.isoformat() if self.date else None,
            'note': self.note,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Document(db.Model):
    __tablename__ = 'documents'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    member_id = db.Column(db.Integer, db.ForeignKey('family_members.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(30), nullable=False, default='other')  # report/checkup/cert/insurance/other
    file_path = db.Column(db.String(500), nullable=True)
    doc_date = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'member_id': self.member_id,
            'name': self.name,
            'category': self.category,
            'file_path': self.file_path,
            'doc_date': self.doc_date.isoformat() if self.doc_date else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# ============================================================
# Default permissions helper
# ============================================================

def get_default_permissions(role):
    """Generate default permissions dict for a given role."""
    if role == 'admin':
        return {
            'finance': {'read': True, 'write': True, 'admin': True},
            'health': {'read': True, 'write': True, 'admin': True},
            'pregnancy': {'read': True, 'write': True, 'admin': True},
            'items': {'read': True, 'write': True, 'admin': True},
            'docs': {'read': True, 'write': True, 'admin': True},
            'menstruation': {'read': True, 'write': True, 'admin': True}
        }
    elif role == 'partner':
        return {
            'finance': {'read': True, 'write': True, 'admin': False},
            'health': {'read': True, 'write': 'own', 'admin': False},
            'pregnancy': {'read': True, 'write': False, 'admin': False},
            'items': {'read': True, 'write': True, 'admin': False},
            'docs': {'read': True, 'write': True, 'admin': False},
            'menstruation': {'read': False, 'write': False, 'admin': False}
        }
    elif role == 'child':
        return {
            'health': {'read': True, 'write': 'own', 'admin': False},
            'pregnancy': {'read': False, 'write': False, 'admin': False},
            'items': {'read': True, 'write': False, 'admin': False},
            'docs': {'read': True, 'write': False, 'admin': False},
            'menstruation': {'read': False, 'write': False, 'admin': False}
        }
    elif role == 'elder':
        return {
            'health': {'read': True, 'write': 'own', 'admin': False},
            'pregnancy': {'read': False, 'write': False, 'admin': False},
            'items': {'read': True, 'write': False, 'admin': False},
            'docs': {'read': True, 'write': False, 'admin': False},
            'menstruation': {'read': False, 'write': False, 'admin': False}
        }
    elif role == 'guest':
        return {
            'finance': {'read': False, 'write': False, 'admin': False},
            'health': {'read': False, 'write': False, 'admin': False},
            'pregnancy': {'read': False, 'write': False, 'admin': False},
            'items': {'read': True, 'write': False, 'admin': False},
            'docs': {'read': True, 'write': False, 'admin': False},
            'menstruation': {'read': False, 'write': False, 'admin': False}
        }
    else:  # custom
        return {
            'finance': {'read': False, 'write': False, 'admin': False},
            'health': {'read': True, 'write': 'own', 'admin': False},
            'pregnancy': {'read': False, 'write': False, 'admin': False},
            'items': {'read': True, 'write': False, 'admin': False},
            'docs': {'read': True, 'write': False, 'admin': False},
            'menstruation': {'read': False, 'write': False, 'admin': False}
        }
