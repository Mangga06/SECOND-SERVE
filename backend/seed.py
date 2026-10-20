"""Explicit local account provisioning; never ships a default password."""
import argparse
import getpass
from sqlalchemy import select
from .db import Session
from .models import User, Organization, Role
from .security import passwords, ROLES
from .services import seed_org

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', default='Workspace administrator')
    parser.add_argument('--role', choices=ROLES, default='SUPER_ADMIN')
    args = parser.parse_args()
    password = getpass.getpass('Password (10+ characters): ')
    if len(password) < 10:
        raise SystemExit('Password must have at least 10 characters.')
    with Session() as db:
        for role in ROLES:
            if not db.get(Role, role):
                db.add(Role(id=role))
        db.flush()
        user = db.scalar(select(User).where(User.email == args.email.lower()))
        if user:
            user.password_hash = passwords.hash(password)
            user.role = args.role
            user.token_version += 1
        else:
            org = Organization(name='Second Serve')
            db.add(org)
            db.flush()
            seed_org(db, org)
            db.add(User(name=args.name, email=args.email.lower(), password_hash=passwords.hash(
                password), role=args.role, organization_id=org.id))
        db.commit()
    print('Account provisioned.')
