"""
身份路由引擎 — IdentityRouter
四元组 Profile (role + gender + stage + health_tags) → 模块/动作/内容差异化
"""
import json


class IdentityRouter:
    """身份路由引擎"""

    def __init__(self, db_session=None):
        self.db = db_session

    # ============================================================
    # 获取成员完整 Profile
    # ============================================================

    def get_member_profile(self, member_id):
        """返回完整四元组 Profile"""
        from models import FamilyMember, PregnancyPlan

        member = self.db.session.query(FamilyMember).filter(
            FamilyMember.id == member_id
        ).first()
        if not member:
            return None

        plan = self.db.session.query(PregnancyPlan).filter(
            PregnancyPlan.member_id == member_id
        ).first()

        health_tags = member.get_health_tags()
        permissions = member.get_permissions()

        # 如果没有存储权限，使用默认权限
        if not permissions:
            from models import get_default_permissions
            permissions = get_default_permissions(member.role)

        stage = member.active_stage or 'general'
        if plan:
            if plan.confirmed_date:
                stage = 'pregnancy'
            elif plan.planned_date:
                if plan.stage:
                    stage = plan.stage

        return {
            'id': member.id,
            'name': member.name,
            'role': member.role,
            'gender': member.gender,
            'birth_date': member.birth_date.isoformat() if member.birth_date else None,
            'stage': stage,
            'health_tags': health_tags,
            'permissions': permissions,
            'is_active': member.is_active
        }

    # ============================================================
    # 模块可见性
    # ============================================================

    def get_visible_modules(self, member_id):
        """返回该成员可见的模块列表"""
        profile = self.get_member_profile(member_id)
        if not profile:
            return []

        permissions = profile['permissions']
        visible = []

        module_map = {
            'finance': '财务',
            'health': '健康',
            'pregnancy': '孕产育',
            'items': '物品',
            'docs': '文档',
            'menstruation': '生理期'
        }

        for module_key, module_name in module_map.items():
            perm = permissions.get(module_key, {})
            if isinstance(perm, dict) and perm.get('read', False):
                visible.append({
                    'key': module_key,
                    'name': module_name,
                    'can_write': perm.get('write', False),
                    'can_admin': perm.get('admin', False)
                })

        # admin always sees member management
        if profile['role'] == 'admin':
            visible.append({
                'key': 'members',
                'name': '成员管理',
                'can_write': True,
                'can_admin': True
            })

        return visible

    # ============================================================
    # 权限检查
    # ============================================================

    def can_read(self, member_id, module):
        """检查是否可读取某模块"""
        profile = self.get_member_profile(member_id)
        if not profile:
            return False
        if profile['role'] == 'admin':
            return True
        perm = profile['permissions'].get(module, {})
        return perm.get('read', False) if isinstance(perm, dict) else False

    def can_write(self, member_id, module, data_owner_id=None):
        """
        检查是否可写入某模块。
        - write=true  → 全部可写
        - write='own' → 仅操作自己的数据
        - write=false → 不可写
        """
        profile = self.get_member_profile(member_id)
        if not profile:
            return False
        if profile['role'] == 'admin':
            return True
        perm = profile['permissions'].get(module, {})
        if not isinstance(perm, dict):
            return False
        write = perm.get('write', False)
        if write is True:
            return True
        if write == 'own' and data_owner_id is not None:
            return int(data_owner_id) == int(member_id)
        return False

    # ============================================================
    # 模块差异化内容加载
    # ============================================================

    def get_module_content(self, member_id, module):
        """根据身份返回模块的内容配置"""
        profile = self.get_member_profile(member_id)
        if not profile:
            return None

        if module == 'health':
            return self._health_content(profile)
        elif module == 'pregnancy':
            return self._pregnancy_content(profile)
        elif module == 'finance':
            return self._finance_content(profile)
        return {}

    def _health_content(self, profile):
        """健康模块按性别+角色差异化"""
        content = {'submodules': []}

        if profile['gender'] == 'female' or profile['role'] == 'admin':
            content['submodules'].append({
                'key': 'menstruation',
                'name': '生理期管理',
                'visible': True
            })

        content['submodules'].append({
            'key': 'motion',
            'name': '运动管理',
            'visible': True
        })
        content['submodules'].append({
            'key': 'diet',
            'name': '饮食管理',
            'visible': True
        })
        content['submodules'].append({
            'key': 'sleep',
            'name': '睡眠管理',
            'visible': True
        })
        content['submodules'].append({
            'key': 'mood',
            'name': '情绪管理',
            'visible': profile['role'] in ('admin', 'partner')
        })
        content['submodules'].append({
            'key': 'checkup',
            'name': '体检复查',
            'visible': True
        })

        return content

    def _pregnancy_content(self, profile):
        """孕产育模块 — partner 只读视图"""
        can_write = profile['role'] == 'admin'
        return {
            'readonly': not can_write,
            'note': '伴侣仅可查看备孕进度，不可管理' if not can_write else None
        }

    def _finance_content(self, profile):
        return {'shared': True}

    # ============================================================
    # 权限矩阵查询
    # ============================================================

    def get_permission_matrix(self):
        """返回完整权限矩阵"""
        return {
            'admin': {
                'finance': 'RW', 'health': 'RW', 'pregnancy': 'RW',
                'items': 'RW', 'docs': 'RW', 'members': 'RW',
                'menstruation': 'RW'
            },
            'partner': {
                'finance': 'RW', 'health': 'O', 'pregnancy': 'R',
                'items': 'RW', 'docs': 'RW', 'members': '-',
                'menstruation': '-'
            },
            'child': {
                'finance': '-', 'health': 'O', 'pregnancy': '-',
                'items': '-', 'docs': '-', 'members': '-',
                'menstruation': '-'
            },
            'elder': {
                'finance': 'R', 'health': 'O', 'pregnancy': '-',
                'items': 'R', 'docs': '-', 'members': '-',
                'menstruation': '-'
            },
            'guest': {
                'finance': '-', 'health': '-', 'pregnancy': '-',
                'items': 'R', 'docs': 'R', 'members': '-',
                'menstruation': '-'
            }
        }
