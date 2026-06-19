from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.auth import TokenPair, UserCreate, UserLogin
from backend.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=TokenPair)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> TokenPair:
    service = AuthService(db)
    service.register_user(payload.email, payload.password)
    tokens = service.authenticate(payload.email, payload.password)
    if tokens is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to create account")
    return TokenPair(access_token=tokens[0], refresh_token=tokens[1])


@router.post("/login", response_model=TokenPair)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenPair:
    service = AuthService(db)
    tokens = service.authenticate(payload.email, payload.password)
    if tokens is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenPair(access_token=tokens[0], refresh_token=tokens[1])
