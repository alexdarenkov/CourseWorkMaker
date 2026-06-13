package com.courseworkmaker.document.controller;

import com.courseworkmaker.document.entity.DocumentEntity;
import com.courseworkmaker.document.repo.DocumentRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private static final int MAX_DOCUMENTS_PER_USER = 100;
    private static final int MAX_CONTENT_CHARS = 2_000_000;

    private final DocumentRepository documents;

    public DocumentController(DocumentRepository documents) {
        this.documents = documents;
    }

    public record DocumentMeta(UUID id, String name, OffsetDateTime updatedAt) {
    }

    public record DocumentResponse(
            UUID id, String name, String content, String settings, OffsetDateTime updatedAt
    ) {
    }

    public record DocumentRequest(
            @NotNull @Size(min = 1, max = 255) String name,
            @NotNull @Size(max = MAX_CONTENT_CHARS) String content,
            @NotNull @Size(max = 100_000) String settings
    ) {
    }

    @GetMapping
    public List<DocumentMeta> list(@RequestHeader("X-User-Id") UUID userId) {
        return documents.findAllByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(d -> new DocumentMeta(d.getId(), d.getName(), d.getUpdatedAt()))
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public DocumentResponse create(
            @RequestHeader("X-User-Id") UUID userId,
            @Valid @RequestBody DocumentRequest req
    ) {
        if (documents.countByUserId(userId) >= MAX_DOCUMENTS_PER_USER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Достигнут лимит документов");
        }
        DocumentEntity doc = new DocumentEntity();
        doc.setUserId(userId);
        apply(doc, req);
        return toResponse(documents.save(doc));
    }

    @GetMapping("/{id}")
    public DocumentResponse get(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable UUID id
    ) {
        return toResponse(find(userId, id));
    }

    @PutMapping("/{id}")
    @Transactional
    public DocumentResponse update(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable UUID id,
            @Valid @RequestBody DocumentRequest req
    ) {
        DocumentEntity doc = find(userId, id);
        apply(doc, req);
        return toResponse(documents.save(doc));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable UUID id
    ) {
        documents.delete(find(userId, id));
    }

    private DocumentEntity find(UUID userId, UUID id) {
        return documents.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Документ не найден"));
    }

    private void apply(DocumentEntity doc, DocumentRequest req) {
        doc.setName(req.name().trim());
        doc.setContent(req.content());
        doc.setSettings(req.settings());
    }

    private DocumentResponse toResponse(DocumentEntity d) {
        return new DocumentResponse(
                d.getId(), d.getName(), d.getContent(), d.getSettings(), d.getUpdatedAt()
        );
    }
}
