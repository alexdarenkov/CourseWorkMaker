import re

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


# XML 1.0 не допускает эти символы даже в экранированном тексте.
_INVALID_XML_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")


def validate_document_text(value: str) -> str:
    if isinstance(value, str) and _INVALID_XML_TEXT.search(value):
        raise ValueError("Текст содержит недопустимые для DOCX управляющие символы")
    return value


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class GostSettings(CamelModel):
    title_page: bool = True
    toc: bool = True
    page_numbers: bool = True
    bibliography: bool = True
    auto_number: bool = True

    # Титульный лист — свободные многострочные блоки (см. Settings фронтенда):
    # шапка по центру, ключ логотипа в assets, тип работы, тема (полужирно в
    # кавычках), исполнители («Метка: текст» → метка слева, текст справа),
    # низ по центру.
    title_header: str = Field(default="", max_length=10000)
    title_logo: str = Field(default="", max_length=10000)
    title_work: str = Field(default="", max_length=10000)
    topic: str = Field(default="", max_length=10000)
    title_people: str = Field(default="", max_length=10000)
    title_bottom: str = Field(default="", max_length=10000)

    @field_validator("title_header", "title_logo", "title_work", "topic", "title_people", "title_bottom", mode="before")
    @classmethod
    def valid_title_text(cls, value: str) -> str:
        return validate_document_text(value)


class ConvertRequest(CamelModel):
    markdown: str = Field(max_length=2_000_000)
    doc_name: str = Field(default="Курсовая работа", max_length=255)
    settings: GostSettings = Field(default_factory=GostSettings)
    # Ключ — src изображения из markdown либо "mermaid-<N>" (N — порядковый номер
    # mermaid-блока в документе); значение — data-URL или чистый base64 PNG.
    assets: dict[str, str] = Field(default_factory=dict, max_length=256)

    @field_validator("markdown", "doc_name", mode="before")
    @classmethod
    def valid_text(cls, value: str) -> str:
        return validate_document_text(value)

    @field_validator("assets")
    @classmethod
    def bounded_assets(cls, assets: dict[str, str]) -> dict[str, str]:
        oversized_entry = any(
            len(key) > 2048 or len(value) > 14 * 1024 * 1024
            for key, value in assets.items()
        )
        total_size = sum(map(len, assets.values()))
        if oversized_entry or total_size > 24 * 1024 * 1024:
            raise ValueError("Изображения превышают допустимый размер")
        return assets
