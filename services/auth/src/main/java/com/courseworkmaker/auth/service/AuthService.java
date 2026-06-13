package com.courseworkmaker.auth.service;

import com.courseworkmaker.auth.dto.Dtos.AuthResponse;
import com.courseworkmaker.auth.dto.Dtos.ChangePasswordRequest;
import com.courseworkmaker.auth.dto.Dtos.LoginRequest;
import com.courseworkmaker.auth.dto.Dtos.RegisterRequest;
import com.courseworkmaker.auth.dto.Dtos.UpdateProfileRequest;
import com.courseworkmaker.auth.dto.Dtos.UserResponse;
import com.courseworkmaker.auth.entity.User;
import com.courseworkmaker.auth.exception.ApiException;
import com.courseworkmaker.auth.repo.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository users;
    private final JwtService jwt;
    private final PasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthService(UserRepository users, JwtService jwt) {
        this.users = users;
        this.jwt = jwt;
    }

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        if (users.existsByEmailIgnoreCase(req.email())) {
            throw new ApiException(HttpStatus.CONFLICT, "Пользователь с такой почтой уже существует");
        }
        User user = new User();
        user.setName(req.name().trim());
        user.setEmail(req.email().trim().toLowerCase());
        user.setPasswordHash(encoder.encode(req.password()));
        users.save(user);
        return new AuthResponse(jwt.issue(user), toResponse(user));
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest req) {
        User user = users.findByEmailIgnoreCase(req.email().trim())
                .filter(u -> encoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Неверная почта или пароль"));
        return new AuthResponse(jwt.issue(user), toResponse(user));
    }

    @Transactional(readOnly = true)
    public UserResponse me(UUID userId) {
        return toResponse(getUser(userId));
    }

    @Transactional
    public AuthResponse updateProfile(UUID userId, UpdateProfileRequest req) {
        User user = getUser(userId);
        String newEmail = req.email().trim().toLowerCase();
        if (!user.getEmail().equalsIgnoreCase(newEmail) && users.existsByEmailIgnoreCase(newEmail)) {
            throw new ApiException(HttpStatus.CONFLICT, "Эта почта уже занята");
        }
        user.setName(req.name().trim());
        user.setEmail(newEmail);
        users.save(user);
        // Почта/имя входят в токен — выпускаем новый.
        return new AuthResponse(jwt.issue(user), toResponse(user));
    }

    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest req) {
        User user = getUser(userId);
        if (!encoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Текущий пароль указан неверно");
        }
        user.setPasswordHash(encoder.encode(req.newPassword()));
        users.save(user);
    }

    private User getUser(UUID userId) {
        return users.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Пользователь не найден"));
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(user.getId(), user.getName(), user.getEmail());
    }
}
