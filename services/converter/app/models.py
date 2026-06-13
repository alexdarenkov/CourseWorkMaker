from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class GostSettings(CamelModel):
    title_page: bool = True
    toc: bool = True
    page_numbers: bool = True
    bibliography: bool = True
    auto_number: bool = True

    university: str = ""
    department: str = ""
    discipline: str = ""
    topic: str = ""
    group: str = ""
    student: str = ""
    supervisor: str = ""
    city: str = ""
    year: str = ""


class ConvertRequest(CamelModel):
    markdown: str
    doc_name: str = Field(default="Курсовая работа", max_length=255)
    settings: GostSettings = GostSettings()
    # Ключ — src изображения из markdown либо "mermaid-<N>" (N — порядковый номер
    # mermaid-блока в документе); значение — data-URL или чистый base64 PNG.
    assets: dict[str, str] = {}
