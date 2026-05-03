"""
High School Management System API

A super simple FastAPI application that allows students to view and sign up
for extracurricular activities at Mergington High School.
"""

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from pathlib import Path
from typing import Optional
import json
import uuid

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=current_dir / "static"), name="static")

USERS_FILE = current_dir / "users.json"
active_sessions = {}

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def load_users():
    if not USERS_FILE.exists():
        return {}
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_users(users):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


def get_user_by_email(email: str):
    users = load_users()
    return users.get(normalize_email(email))


def get_user_from_token(token: str):
    email = active_sessions.get(token)
    return get_user_by_email(email) if email else None


def create_auth_token(email: str):
    token = uuid.uuid4().hex
    active_sessions[token] = normalize_email(email)
    return token


def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.split(" ", 1)[1]
    user = get_user_from_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.post("/auth/register")
def register(user: UserRegister):
    role = user.role.strip().lower()
    if role not in {"admin", "student"}:
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'student'")

    if get_user_by_email(user.email):
        raise HTTPException(status_code=400, detail="A user with that email already exists")

    users = load_users()
    users[normalize_email(user.email)] = {
        "username": user.username.strip(),
        "password": user.password,
        "role": role,
        "email": normalize_email(user.email)
    }
    save_users(users)
    return {
        "message": "Registration successful",
        "user": {
            "username": user.username.strip(),
            "email": normalize_email(user.email),
            "role": role
        }
    }


@app.post("/auth/login")
def login(credentials: UserLogin):
    user = get_user_by_email(credentials.email)
    if user is None or user["password"] != credentials.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_auth_token(credentials.email)
    return {
        "token": token,
        "user": {
            "username": user["username"],
            "email": user["email"],
            "role": user["role"]
        }
    }


@app.get("/users/me")
def users_me(user: dict = Depends(get_current_user)):
    return {
        "username": user["username"],
        "email": user["email"],
        "role": user["role"]
    }


# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}


@app.get("/activities")
def get_activities():
    return activities


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(
    activity_name: str,
    email: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """Sign up a student for an activity"""
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        user = get_user_from_token(token)
        if user:
            if user["role"] == "student":
                email = user["email"]
            elif user["role"] == "admin" and not email:
                raise HTTPException(status_code=400, detail="Admin must provide a student email")

    if not email:
        raise HTTPException(status_code=400, detail="Email is required to sign up")

    email = normalize_email(email)
    activity = activities[activity_name]

    if email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(
    activity_name: str,
    email: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """Unregister a student from an activity"""
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        user = get_user_from_token(token)
        if user and user["role"] == "student":
            email = user["email"]

    if not email:
        raise HTTPException(status_code=400, detail="Email is required to unregister")

    email = normalize_email(email)
    activity = activities[activity_name]

    if email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
