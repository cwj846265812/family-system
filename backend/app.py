"""
家庭管理系统 — Flask 主入口
Flask + SQLAlchemy + SQLite，Blueprint 路由模式
"""
import os
import sys
from flask import Flask, send_from_directory, abort
from flask_cors import CORS

# ============================================================
# App 初始化
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

app = Flask(__name__)
CORS(app)

# 数据库配置：优先使用环境变量 DATABASE_URL（PostgreSQL），否则回退到 SQLite
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
else:
    DATA_DIR = os.path.join(BASE_DIR, 'data')
    os.makedirs(DATA_DIR, exist_ok=True)
    DB_PATH = os.path.join(DATA_DIR, 'family.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'family-system-secret-key-2026')

# 使用 models.py 中的唯一 db 实例
from models import db
db.init_app(app)

# ============================================================
# 注册蓝图路由（在 db.init_app 之后导入，确保 models 已绑定）
# ============================================================

from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.health import health_bp
from routes.pregnancy import pregnancy_bp
from routes.items import items_bp
from routes.finance import finance_bp
from routes.documents import documents_bp

app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(health_bp)
app.register_blueprint(pregnancy_bp)
app.register_blueprint(items_bp)
app.register_blueprint(finance_bp)
app.register_blueprint(documents_bp)

# ============================================================
# 首次启动初始化
# ============================================================

def init_default_members():
    """初始化默认家庭成员（admin本人女 + partner伴侣男），设置默认密码"""
    from models import FamilyMember
    from datetime import date
    import hashlib

    def hash_pw(pw):
        return hashlib.sha256(pw.encode('utf-8')).hexdigest()

    admin_exists = FamilyMember.query.filter_by(id=1).first()
    if not admin_exists:
        admin = FamilyMember(
            id=1,
            name='我',
            role='admin',
            gender='female',
            birth_date=date(1995, 3, 15),
            password_hash=hash_pw('123456'),
            active_stage='pre_pregnancy',
            health_tags='["pcos", "adenomyosis", "breast_nodule"]',
            is_active=True
        )
        db.session.add(admin)

    partner_exists = FamilyMember.query.filter_by(id=2).first()
    if not partner_exists:
        partner = FamilyMember(
            id=2,
            name='伴侣',
            role='partner',
            gender='male',
            birth_date=date(1993, 8, 20),
            password_hash=hash_pw('123456'),
            active_stage='general',
            health_tags='[]',
            is_active=True
        )
        db.session.add(partner)

    # 如果已有成员但没有密码，补充默认密码
    all_members = FamilyMember.query.all()
    for m in all_members:
        if not m.password_hash:
            m.password_hash = hash_pw('123456')
    db.session.commit()
    print("[Init] Default family members created / password updated.")

# ============================================================
# 静态文件服务（前后端同源，避免 file:// 跨域问题）
# ============================================================

FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), 'frontend')

@app.route('/')
def serve_app():
    return send_from_directory(FRONTEND_DIR, 'app.html')

@app.route('/index.html')
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    # Try exact path first
    full_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(full_path):
        return send_from_directory(FRONTEND_DIR, filename)
    # Fallback: strip leading directory component (e.g. "health/health.html" -> "health.html")
    basename = os.path.basename(filename)
    fallback = os.path.join(FRONTEND_DIR, basename)
    if os.path.isfile(fallback):
        return send_from_directory(FRONTEND_DIR, basename)
    # Last resort: return 404
    abort(404)

# ============================================================
# 启动
# ============================================================

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print(f"[Init] Database created at: {DB_PATH}")
        init_default_members()
    port = int(os.environ.get('PORT', 5000))
    print(f"[Init] Server starting on 0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
