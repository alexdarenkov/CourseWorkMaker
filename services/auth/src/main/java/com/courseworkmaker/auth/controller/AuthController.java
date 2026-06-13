package com.courseworkmaker.auth.controller;

import com.courseworkmaker.auth.dto.Dtos.AuthResponse;
import com.courseworkmaker.auth.dto.Dtos.ChangePasswordRequest;
import com.courseworkmaker.auth.dto.Dtos.LoginRequest;
import com.courseworkmaker.auth.dto.Dtos.RegisterRequest;
import com.courseworkmaker.auth.dto.Dtos.UpdateProfileRequest;
import com.courseworkmaker.auth.dto.Dtos.UserResponse;
import com.courseworkmaker.auth.exception.ApiException;
import com.courseworkmaker.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest req) {
        return auth.register(req);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req);
    }

    @GetMapping("/me")
    public UserResponse me(@RequestHeader(name = "X-User-Id", required = false) String userId) {
        return auth.me(requireUser(userId));
    }

    @PutMapping("/me")
    public AuthResponse updateProfile(
            @RequestHeader(name = "X-User-Id", required = false) String userId,
            @Valid @RequestBody UpdateProfileRequest req
    ) {
        return auth.updateProfile(requireUser(userId), req);
    }

    @PutMapping("/me/password")
    public void changePassword(
            @RequestHeader(name = "X-User-Id", required = false) String userId,
            @Valid @RequestBody ChangePasswordRequest req
    ) {
        auth.changePassword(requireUser(userId), req);
    }

    private UUID requireUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Требуется авторизация");
        }
        try {
            return UUID.fromString(userId);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Требуется авторизация");
        }
    }
}
