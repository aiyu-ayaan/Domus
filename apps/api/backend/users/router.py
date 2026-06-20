from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.auth.schemas import UserPublic
from backend.core.database import get_db
from backend.users.schemas import UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me", response_model=UserPublic)
async def get_me(user: CurrentUser) -> UserPublic:
    return UserPublic.model_validate(user)


@router.patch("/me", response_model=UserPublic)
async def update_me(data: UserUpdate, user: CurrentUser, session: Session) -> UserPublic:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await session.flush()
    return UserPublic.model_validate(user)


from fastapi import UploadFile, File, HTTPException
import os
import uuid
import shutil

@router.post("/me/avatar", response_model=UserPublic)
async def upload_avatar(
    user: CurrentUser,
    session: Session,
    file: UploadFile = File(...)
) -> UserPublic:
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be an image"
        )
    
    # Ensure directory exists
    static_dir = os.path.join(os.getcwd(), "static", "avatars")
    os.makedirs(static_dir, exist_ok=True)
    
    # Generate unique filename
    file_ext = os.path.splitext(file.filename or "")[1]
    if not file_ext or len(file_ext) > 10:
        file_ext = ".png"
    
    filename = f"{user.id}_{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(static_dir, filename)
    
    # Save the file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file: {str(e)}"
        )
        
    # Update the user's avatar_url in database
    relative_url = f"/static/avatars/{filename}"
    user.avatar_url = relative_url
    await session.flush()
    
    return UserPublic.model_validate(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(user: CurrentUser, session: Session) -> None:
    await session.delete(user)
