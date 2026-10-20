import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
import jwt
from .db import DATA, get_db
from .models import User

secret_file = DATA / '.session-secret'
if not os.getenv('SECRET_KEY') and not secret_file.exists():
    secret_file.write_text(secrets.token_hex(48))
SECRET = os.getenv('SECRET_KEY') or secret_file.read_text().strip()
if len(SECRET) < 32:
    raise RuntimeError('SECRET_KEY must contain at least 32 characters')
passwords = PasswordHash.recommended()
DUMMY = passwords.hash(secrets.token_urlsafe(24))
ROLES = ['USER', 'CAFETERIA_MANAGER', 'ORGANIZATION_ADMIN', 'SUPER_ADMIN']


def token(user, remember=False):
    return jwt.encode({'sub': str(user.id), 'version': user.token_version, 'exp': datetime.now(timezone.utc) + timedelta(days=7 if remember else .5)}, SECRET, algorithm='HS256')


def current_user(request: Request, db=Depends(get_db)):
    try:
        payload = jwt.decode(request.cookies.get(
            'session', ''), SECRET, algorithms=['HS256'])
        user = db.get(User, int(payload['sub']))
        if not user or payload['version'] != user.token_version:
            raise ValueError()
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(
            401, 'Your session has expired. Please sign in again.')


def admin(user=Depends(current_user)):
    if user.role not in ['ORGANIZATION_ADMIN', 'SUPER_ADMIN']:
        raise HTTPException(403, 'Administrator access required.')
    return user


def superadmin(user=Depends(admin)):
    if user.role != 'SUPER_ADMIN':
        raise HTTPException(403, 'Super administrator access required.')
    return user


def public_user(user):
    return {k: getattr(user, k) for k in ['id', 'name', 'email', 'role', 'organization_id', 'cafeteria_id', 'settings']}
