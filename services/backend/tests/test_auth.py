"""HTTP-поверхность /api/auth/* — контракт совпадает с прежним Java-сервисом."""


def test_register_returns_token_and_user(client):
    r = client.post(
        "/api/auth/register",
        json={"name": "Аня", "email": "anya@example.com", "password": "password123"},
    )
    assert r.status_code == 200
    b = r.json()
    assert b["token"]
    assert b["user"]["email"] == "anya@example.com"
    assert b["user"]["name"] == "Аня"
    assert b["user"]["id"]


def test_register_duplicate_email_conflict(client, auth):
    auth(email="dup@example.com")
    # Регистр почты не важен — уникальность регистронезависимая.
    r = client.post(
        "/api/auth/register",
        json={"name": "X", "email": "DUP@example.com", "password": "password123"},
    )
    assert r.status_code == 409


def test_register_validation(client):
    bad_email = client.post(
        "/api/auth/register",
        json={"name": "X", "email": "не-почта", "password": "password123"},
    )
    assert bad_email.status_code == 422
    short_pw = client.post(
        "/api/auth/register",
        json={"name": "X", "email": "a@b.ru", "password": "short"},
    )
    assert short_pw.status_code == 422


def test_login_ok_wrong_and_unknown(client, auth):
    auth(email="login@example.com", password="password123")
    ok = client.post(
        "/api/auth/login", json={"email": "login@example.com", "password": "password123"}
    )
    assert ok.status_code == 200 and ok.json()["token"]
    bad = client.post(
        "/api/auth/login", json={"email": "login@example.com", "password": "nope"}
    )
    assert bad.status_code == 401
    unknown = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "password123"}
    )
    assert unknown.status_code == 401


def test_me_requires_auth(client, auth):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage.token"}).status_code == 401
    headers, body = auth()
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["email"] == body["user"]["email"]


def test_update_profile_changes_and_reissues(client, auth):
    headers, _ = auth(email="old@example.com")
    r = client.put(
        "/api/auth/me", headers=headers, json={"name": "Новое имя", "email": "new@example.com"}
    )
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "new@example.com"
    assert r.json()["user"]["name"] == "Новое имя"
    assert r.json()["token"]
    me = client.get("/api/auth/me", headers=headers)
    assert me.json()["email"] == "new@example.com"


def test_update_profile_email_taken(client, auth):
    auth(email="taken@example.com")
    headers, _ = auth(email="me@example.com")
    r = client.put(
        "/api/auth/me", headers=headers, json={"name": "X", "email": "taken@example.com"}
    )
    assert r.status_code == 409


def test_change_password(client, auth):
    headers, _ = auth(email="pw@example.com", password="password123")
    wrong = client.put(
        "/api/auth/me/password",
        headers=headers,
        json={"currentPassword": "nope", "newPassword": "newpassword1"},
    )
    assert wrong.status_code == 401
    ok = client.put(
        "/api/auth/me/password",
        headers=headers,
        json={"currentPassword": "password123", "newPassword": "newpassword1"},
    )
    assert ok.status_code == 204
    assert (
        client.post(
            "/api/auth/login", json={"email": "pw@example.com", "password": "password123"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": "pw@example.com", "password": "newpassword1"}
        ).status_code
        == 200
    )
