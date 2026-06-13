package com.courseworkmaker.gateway.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Проверяет JWT на всех маршрутах, кроме публичных, и прокидывает
 * X-User-Id / X-User-Email вышестоящим сервисам. Заголовки X-User-*,
 * пришедшие от клиента, всегда вырезаются.
 */
@Component
public class JwtAuthFilter implements GlobalFilter, Ordered {

    private static final Set<String> PUBLIC_PATHS = Set.of(
            "/api/auth/login",
            "/api/auth/register"
    );

    private final JwtParser parser;

    public JwtAuthFilter(@Value("${app.jwt.secret}") String secret) {
        this.parser = Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)))
                .build();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        ServerHttpRequest.Builder sanitized = request.mutate().headers(h -> {
            h.remove("X-User-Id");
            h.remove("X-User-Email");
            h.remove("X-User-Name");
        });

        String path = request.getPath().value();
        if (HttpMethod.OPTIONS.equals(request.getMethod()) || PUBLIC_PATHS.contains(path)) {
            return chain.filter(exchange.mutate().request(sanitized.build()).build());
        }

        String authHeader = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return unauthorized(exchange);
        }
        try {
            Claims claims = parser.parseSignedClaims(authHeader.substring(7)).getPayload();
            sanitized.header("X-User-Id", claims.getSubject());
            String email = claims.get("email", String.class);
            if (email != null && email.chars().allMatch(c -> c < 128)) {
                sanitized.header("X-User-Email", email);
            }
        } catch (JwtException | IllegalArgumentException e) {
            return unauthorized(exchange);
        }
        return chain.filter(exchange.mutate().request(sanitized.build()).build());
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        byte[] body = "{\"message\":\"Требуется авторизация\"}".getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = response.bufferFactory().wrap(body);
        return response.writeWith(Mono.just(buffer));
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
