import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, Type, Optional, Union, ClassVar

from bidict import bidict
from django.conf import settings

MessageID = Union[int, str]


@dataclass(frozen=True)
class Header:
    msg_type: str
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
        return cls(header, *args, **kwargs)  # todo: make typechecker happy


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


def _encode(o):
    if o.__class__ in MESSAGE_TYPES.inverse:
        return asdict(o)
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
