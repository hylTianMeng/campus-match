"""模型汇总导出。

统一从此处导入所有模型，保证 Alembic 的 ``Base.metadata`` 能收集到全部表。
"""
from app.models.application import Application, ApplicationHistory
from app.models.message import Conversation, ConversationParticipant, Message
from app.models.recruitment import Position, Recruitment
from app.models.tag import Tag, position_tags, recruitment_tags
from app.models.user import User

__all__ = [
    "Application",
    "ApplicationHistory",
    "Conversation",
    "ConversationParticipant",
    "Message",
    "Position",
    "Recruitment",
    "Tag",
    "User",
    "position_tags",
    "recruitment_tags",
]
