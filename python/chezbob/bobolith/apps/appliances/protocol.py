import json
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict, field
from typing import Protocol, Type, Optional, Union, ClassVar

from bidict import bidict
from django.conf import settings

MessageID = Union[int, str]


@dataclass(frozen=True)
class Header:
    msg_type: str
    msg_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    version: int = settings.BOBOLITH_PROTOCOL_VERSION
    in_reply_to: Optional[MessageID] = None


@dataclass(frozen=True)
class Message:
    msg_type: ClassVar[str]
    header: Header

    def __init_subclass__(cls, msg_type=None, **kwargs):
        cls.msg_type = msg_type
        if cls not in MESSAGE_TYPES.inverse:
            MESSAGE_TYPES[msg_type] = cls

    @classmethod
    def make(cls, *args, **kwargs):
        header = Header(cls.msg_type)
        return cls(header, *args, **kwargs)

    # Create a message in-reply-to Message reply_to
    # Necessary because reply can only respond with the same type of message
    @classmethod
    def make_reply(cls, reply_to, *args, **kwargs):
        header = Header(cls.msg_type, in_reply_to=reply_to.header.msg_id)
        return cls(header, *args, **kwargs)

    def reply(self, *args, **kwargs):
        header = Header(self.__class__.msg_type, in_reply_to=self.header.msg_id)
        return self.__class__(header, *args, **kwargs)


@dataclass(frozen=True)
class Error:
    header: Header
    code: int
    message: str


MESSAGE_TYPES: bidict[str, Type[Message]] = bidict({})  # todo: ERROR_TYPES?


@dataclass(frozen=True)
class PingMessage(Message, msg_type='ping'):
    message: str


@dataclass(frozen=True)
class PongMessage(Message, msg_type='pong'):
    message: str


@dataclass(frozen=True)
class RelayMessage(Message, msg_type='relay'):
   dst: str
   payload: dict

def _encode(o):
    if o.__class__ in MESSAGE_TYPES.inverse:
        msg_dict = asdict(o)
        header = msg_dict.pop('header')
        return {
            'header': header,
            'body': msg_dict
        }
    else:
        raise TypeError(f'Object of type {o.__class__.__name__} '
                        f'is not JSON serializable')


def _decode(json_dict):
    if 'header' not in json_dict \
            or not isinstance(json_dict['header'], dict) \
            or 'msg_type' not in json_dict['header']:
        return json_dict

    # Copy, to avoid mutating parameters...
    header = header = Header(**json_dict['header'])

    has_body = 'body' in json_dict
    has_error = 'error' in json_dict

    # Is this an error message?
    if 'error' in json_dict:
        # todo: handle this more elegantly?
        assert 'body' not in json_dict
        return Error(header=header, **json_dict['error'])

    cls = MESSAGE_TYPES[header.msg_type]
    msg = cls(header=header, **json_dict['body'])

    return msg


MessageEncoder = json.JSONEncoder(default=_encode)
MessageDecoder = json.JSONDecoder(object_hook=_decode)
