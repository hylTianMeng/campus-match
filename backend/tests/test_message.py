"""私信收发、未读、会话测试。"""
from tests.conftest import get_user, make_user
from app.services.message_service import MessageService
from app.core.exceptions import BizError


def test_send_and_list_conversations(user_factory):
    a = get_user(user_factory("msg-a1@stu.example.edu", "A"))
    b = get_user(user_factory("msg-b1@stu.example.edu", "B"))
    svc = MessageService()

    conv = svc.get_or_create_conversation(a.id, b.id)
    assert conv["other_user"]["id"] == b.id

    msg = svc.send(a.id, conv["id"], "你好")
    assert msg["content"] == "你好"

    # 会话列表（B 视角有 1 条未读）
    convs_b = svc.list_conversations(b.id)
    assert len(convs_b) == 1
    assert convs_b[0]["id"] == conv["id"]
    assert convs_b[0]["unread_count"] == 1
    assert convs_b[0]["last_message"]["content"] == "你好"

    # A 视角未读为 0（自己发的消息不算未读）
    convs_a = svc.list_conversations(a.id)
    assert convs_a[0]["unread_count"] == 0


def test_mark_read_clears_unread(user_factory):
    a = get_user(user_factory("msg-a2@stu.example.edu", "A"))
    b = get_user(user_factory("msg-b2@stu.example.edu", "B"))
    svc = MessageService()

    conv = svc.get_or_create_conversation(a.id, b.id)
    svc.send(a.id, conv["id"], "第一条")
    svc.send(a.id, conv["id"], "第二条")

    assert svc.unread_count(b.id) == 2

    svc.mark_read(b.id, conv["id"])
    assert svc.unread_count(b.id) == 0


def test_messages_after_id_incremental(user_factory):
    a = get_user(user_factory("msg-a3@stu.example.edu", "A"))
    b = get_user(user_factory("msg-b3@stu.example.edu", "B"))
    svc = MessageService()

    conv = svc.get_or_create_conversation(a.id, b.id)
    m1 = svc.send(a.id, conv["id"], "1")
    m2 = svc.send(a.id, conv["id"], "2")

    msgs = svc.list_messages(b.id, conv["id"], after_id=m1["id"])
    assert [m["content"] for m in msgs] == ["2"]
    assert msgs[0]["id"] == m2["id"]


def test_non_member_cannot_send(user_factory):
    a = get_user(user_factory("msg-a4@stu.example.edu", "A"))
    b = get_user(user_factory("msg-b4@stu.example.edu", "B"))
    c = get_user(user_factory("msg-c4@stu.example.edu", "C"))
    svc = MessageService()

    conv = svc.get_or_create_conversation(a.id, b.id)
    try:
        svc.send(c.id, conv["id"], "越权")
        assert False, "应抛出非会话成员异常"
    except BizError as e:
        assert e.code == 40300


def test_normalized_conversation_pair(user_factory):
    a = get_user(user_factory("msg-a5@stu.example.edu", "A"))
    b = get_user(user_factory("msg-b5@stu.example.edu", "B"))
    svc = MessageService()

    c1 = svc.get_or_create_conversation(a.id, b.id)
    c2 = svc.get_or_create_conversation(b.id, a.id)
    assert c1["id"] == c2["id"]
