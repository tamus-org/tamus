use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

type AppResult<T> = Result<T, String>;
const HISTORY_LIMIT: usize = 100;
const FILE_LIMIT: u64 = 16 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Element {
    pub id: String,
    pub name: String,
    pub description: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Qualifier {
    pub id: String,
    pub name: String,
    pub description: String,
    pub elements: Vec<Element>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Block {
    pub id: String,
    pub name: String,
    pub description: String,
    pub x: f64,
    pub y: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_color: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Flow {
    pub id: String,
    pub name: String,
    pub source_id: Option<String>,
    pub target_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_side: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_side: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_position: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_position: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_flow_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object_ids: Option<Vec<String>>,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiagramSheet {
    pub author: String,
    pub created_at: String,
    pub revised_at: String,
    pub used_at: String,
    pub notes: String,
    pub reader: String,
    pub reader_date: String,
    pub number: String,
    pub node: String,
    pub context: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub description: String,
    pub notation: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    pub blocks: Vec<Block>,
    pub flows: Vec<Flow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sheet: Option<DiagramSheet>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_block_id: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub format: String,
    pub schema_version: u32,
    pub models: Vec<Model>,
    pub qualifiers: Vec<Qualifier>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    UpdateProject {
        name: String,
        description: String,
    },
    AddQualifier {
        qualifier: Qualifier,
    },
    UpdateQualifier {
        id: String,
        name: String,
        description: String,
    },
    DeleteQualifier {
        id: String,
    },
    AddElement {
        qualifier_id: String,
        element: Element,
    },
    UpdateElement {
        qualifier_id: String,
        element: Element,
    },
    DeleteElement {
        qualifier_id: String,
        id: String,
    },
    AddModel {
        model: Model,
    },
    DecomposeBlock {
        model_id: String,
        block_id: String,
        child_id: String,
        #[serde(default)]
        count: Option<usize>,
        #[serde(default)]
        layout: Option<String>,
        #[serde(default)]
        block_name_prefix: Option<String>,
    },
    UpdateModel {
        id: String,
        name: String,
        description: String,
        #[serde(default)]
        sheet: Option<DiagramSheet>,
        #[serde(default)]
        background_color: Option<String>,
    },
    DeleteModel {
        id: String,
    },
    CenterArrows {
        model_id: String,
        #[serde(default)]
        block_id: Option<String>,
    },
    AddBlock {
        model_id: String,
        block: Block,
    },
    UpdateBlock {
        model_id: String,
        block: Block,
    },
    DeleteBlock {
        model_id: String,
        id: String,
    },
    AddFlow {
        model_id: String,
        flow: Flow,
    },
    UpdateFlow {
        model_id: String,
        flow: Flow,
    },
    DeleteFlow {
        model_id: String,
        id: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub project: Project,
    pub revision: String,
    pub path: Option<String>,
    pub dirty: bool,
    pub can_undo: bool,
    pub can_redo: bool,
}

fn decomposition_position(index: usize, count: usize, layout: &str) -> (f64, f64) {
    let (x, y) = match layout {
        "horizontal" => (100 + (index % 6) * 290, 100 + (index / 6) * 200),
        "vertical" => (100 + (index / 10) * 300, 80 + (index % 10) * 180),
        _ => {
            let cols = if count <= 6 {
                count
            } else {
                (count as f64).sqrt().ceil() as usize
            };
            (
                100 + (index % cols) * 290,
                80 + (index % cols) * 130 + (index / cols) * 360,
            )
        }
    };
    (x as f64, y as f64)
}
fn check_color(color: Option<&str>) -> AppResult<()> {
    if color.is_some_and(|s| {
        s.len() != 7 || !s.starts_with('#') || !s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    }) {
        return Err("Цвет должен иметь формат #RRGGBB.".into());
    }
    Ok(())
}
fn check_entity(
    ids: &mut HashSet<String>,
    id: &str,
    name: &str,
    description: &str,
) -> AppResult<()> {
    if id.is_empty() || id.len() > 128 || !ids.insert(id.to_owned()) {
        return Err("Некорректный или повторяющийся ID.".into());
    }
    if name.trim().is_empty() || name.chars().count() > 256 || description.chars().count() > 10000 {
        return Err("Укажите имя до 256 символов и описание до 10 000 символов.".into());
    }
    Ok(())
}
impl Project {
    pub fn validate(&self) -> AppResult<()> {
        if self.format != "tamus-project" || self.schema_version != 1 {
            return Err("Неподдерживаемый формат. Выберите проект Tamus (.tamus.json).".into());
        }
        let mut ids = HashSet::new();
        check_entity(&mut ids, &self.id, &self.name, &self.description)?;
        for q in &self.qualifiers {
            check_entity(&mut ids, &q.id, &q.name, &q.description)?;
            for e in &q.elements {
                check_entity(&mut ids, &e.id, &e.name, &e.description)?;
            }
        }
        for m in &self.models {
            check_entity(&mut ids, &m.id, &m.name, &m.description)?;
            if let Some(sheet) = &m.sheet {
                for value in [
                    &sheet.author,
                    &sheet.created_at,
                    &sheet.revised_at,
                    &sheet.used_at,
                    &sheet.notes,
                    &sheet.reader,
                    &sheet.reader_date,
                    &sheet.number,
                    &sheet.node,
                    &sheet.context,
                ] {
                    if value.chars().count() > 256 {
                        return Err("Поля штампа должны содержать не более 256 символов.".into());
                    }
                }
            }
            check_color(m.background_color.as_deref())?;
            if !["IDEF0", "DFD"].contains(&m.notation.as_str()) {
                return Err("Поддерживаются нотации IDEF0 и DFD.".into());
            }
            if m.parent_block_id.is_none()
                && m.sheet.as_ref().is_some_and(|s| s.node == "A-0")
                && m.blocks.len() > 1
            {
                return Err(
                    "Контекстная диаграмма A-0 содержит один блок. Откройте его декомпозицию."
                        .into(),
                );
            }
            if m.notation == "DFD"
                && m.parent_block_id.is_none()
                && m.sheet.as_ref().is_some_and(|s| s.node == "Контекст")
                && m.blocks
                    .iter()
                    .filter(|b| b.kind.as_deref().unwrap_or("process") == "process")
                    .count()
                    > 1
            {
                return Err("В контексте DFD один процесс. Откройте его декомпозицию.".into());
            }
            for b in &m.blocks {
                check_entity(&mut ids, &b.id, &b.name, &b.description)?;
                let kind = b.kind.as_deref().unwrap_or("process");
                if !["process", "external", "dataStore"].contains(&kind)
                    || (m.notation == "IDEF0" && kind != "process")
                {
                    return Err("Неизвестный вид объекта или неверная нотация.".into());
                }
                check_color(b.fill_color.as_deref())?;
                check_color(b.text_color.as_deref())?;
                if b.width
                    .is_some_and(|v| !v.is_finite() || !(80.0..=800.0).contains(&v))
                    || b.height
                        .is_some_and(|v| !v.is_finite() || !(50.0..=600.0).contains(&v))
                {
                    return Err("Размер блока: ширина 80–800, высота 50–600.".into());
                }
                if !b.x.is_finite()
                    || !b.y.is_finite()
                    || !(0.0..=2000.0).contains(&b.x)
                    || !(0.0..=2000.0).contains(&b.y)
                {
                    return Err("Блок находится за пределами рабочей области.".into());
                }
            }
            for f in &m.flows {
                check_entity(&mut ids, &f.id, "Стрелка", "")?;
                if f.name.chars().count() > 256
                    || f.caption
                        .as_ref()
                        .is_some_and(|s| s.chars().count() > 10000)
                {
                    return Err("Слишком длинное имя потока или подпись сегмента.".into());
                }
                if let Some(objects) = &f.object_ids {
                    let mut seen = HashSet::new();
                    if objects.iter().any(|id| {
                        !seen.insert(id)
                            || !self
                                .qualifiers
                                .iter()
                                .any(|q| q.id == *id || q.elements.iter().any(|e| e.id == *id))
                    }) {
                        return Err("Поток ссылается на отсутствующий объект классификатора. Удалите присоединение перед удалением объекта.".into());
                    }
                }
                let source = f
                    .source_side
                    .as_deref()
                    .unwrap_or(if f.source_id.is_none() {
                        "left"
                    } else {
                        "right"
                    });
                let target = f
                    .target_side
                    .as_deref()
                    .unwrap_or(if f.target_id.is_none() {
                        "right"
                    } else {
                        "left"
                    });
                let sides = ["left", "top", "right", "bottom"];
                if !sides.contains(&source) || !sides.contains(&target) {
                    return Err("Некорректная сторона стрелки.".into());
                }
                if m.notation == "IDEF0" {
                    if (if f.source_id.is_none() {
                        !["left", "top", "bottom"].contains(&source)
                    } else {
                        source != "right"
                    }) || (if f.target_id.is_none() {
                        target != "right"
                    } else {
                        !["left", "top", "bottom"].contains(&target)
                    }) {
                        return Err(
                            "Выход блока справа; вход слева, управление сверху, механизм снизу."
                                .into(),
                        );
                    }
                } else {
                    if (f.source_id.is_none() || f.target_id.is_none())
                        && (m.parent_block_id.is_none() || f.parent_flow_id.is_none())
                    {
                        return Err(
                            "В DFD используйте внешнюю сущность вместо свободной границы.".into(),
                        );
                    }
                    let source_block = m
                        .blocks
                        .iter()
                        .find(|b| Some(&b.id) == f.source_id.as_ref());
                    let target_block = m
                        .blocks
                        .iter()
                        .find(|b| Some(&b.id) == f.target_id.as_ref());
                    if let (Some(source), Some(target)) = (source_block, target_block)
                        && source.kind.as_deref().unwrap_or("process") != "process"
                        && target.kind.as_deref().unwrap_or("process") != "process"
                    {
                        return Err("Поток DFD должен проходить через процесс.".into());
                    }
                }
                for position in [f.source_position, f.target_position].into_iter().flatten() {
                    if !position.is_finite() || !(0.05..=0.95).contains(&position) {
                        return Err("Некорректное положение присоединения стрелки.".into());
                    }
                }

                if f.source_id == f.target_id
                    || f.source_id
                        .as_ref()
                        .is_some_and(|id| !m.blocks.iter().any(|b| &b.id == id))
                    || f.target_id
                        .as_ref()
                        .is_some_and(|id| !m.blocks.iter().any(|b| &b.id == id))
                {
                    return Err("Связь должна соединять два разных блока одной модели.".into());
                }
            }
        }
        let mut owners = HashSet::new();
        for m in &self.models {
            if m.parent_block_id
                .as_ref()
                .is_some_and(|owner| self.parent(m).is_none() || !owners.insert(owner))
            {
                return Err("У декомпозиции должен быть один существующий блок-владелец.".into());
            }
            if let Some(parent) = self.parent(m) {
                let owner = parent
                    .blocks
                    .iter()
                    .find(|b| Some(&b.id) == m.parent_block_id.as_ref())
                    .unwrap();
                if parent.notation != m.notation
                    || owner.kind.as_deref().unwrap_or("process") != "process"
                {
                    return Err("Декомпозиция должна принадлежать процессу той же нотации.".into());
                }
            }
            let mut visited = HashSet::new();
            let mut current = Some(m);
            while let Some(model) = current {
                if !visited.insert(&model.id) {
                    return Err("Цикл в дереве декомпозиции.".into());
                }
                current = self.parent(model);
            }
            for f in &m.flows {
                self.check_flow_interface(&m.id, f)?;
            }
        }
        Ok(())
    }
    fn parent(&self, model: &Model) -> Option<&Model> {
        self.models.iter().find(|m| {
            m.blocks
                .iter()
                .any(|b| Some(&b.id) == model.parent_block_id.as_ref())
        })
    }
    fn node(&self, model: &Model) -> String {
        if let Some(parent) = self.parent(model) {
            let node = self.node(parent);
            let index = parent
                .blocks
                .iter()
                .filter(|b| b.kind.as_deref().unwrap_or("process") == "process")
                .position(|b| Some(&b.id) == model.parent_block_id.as_ref())
                .unwrap()
                + 1;
            if parent.notation == "DFD" {
                if parent.parent_block_id.is_none() && node == "Контекст" {
                    "0".into()
                } else if node == "0" {
                    format!("{index}")
                } else {
                    format!("{node}.{index}")
                }
            } else if node == "A-0" {
                "A0".into()
            } else {
                format!("{}{index}", if node == "A0" { "A" } else { &node })
            }
        } else {
            model
                .sheet
                .as_ref()
                .map(|s| s.node.clone())
                .filter(|s| !s.is_empty())
                .unwrap_or("A0".into())
        }
    }
    fn interface<'a>(&'a self, model: &Model, flow: &Flow) -> Option<(&'a Flow, &'a str, f64)> {
        let parent = self.parent(model)?;
        let id = flow.parent_flow_id.as_ref()?;
        let inherited: Vec<_> = parent
            .flows
            .iter()
            .filter_map(|f| {
                if f.source_id == model.parent_block_id {
                    Some((f, "right"))
                } else if f.target_id == model.parent_block_id {
                    Some((
                        f,
                        if model.notation == "DFD" {
                            "left"
                        } else {
                            f.target_side.as_deref().unwrap_or("left")
                        },
                    ))
                } else {
                    None
                }
            })
            .collect();
        let (parent_flow, side) = *inherited.iter().find(|(f, _)| &f.id == id)?;
        let same: Vec<_> = inherited.iter().filter(|(_, s)| *s == side).collect();
        let index = same.iter().position(|(f, _)| &f.id == id)?;
        Some((
            parent_flow,
            side,
            (index + 1) as f64 / (same.len() + 1) as f64,
        ))
    }
    fn check_flow_interface(&self, model_id: &str, flow: &Flow) -> AppResult<()> {
        if flow.parent_flow_id.is_none() {
            return Ok(());
        }
        let model = self
            .models
            .iter()
            .find(|m| m.id == model_id)
            .ok_or("Диаграмма не найдена.")?;
        if !self.interface(model, flow).is_some_and(|(_, side, _)| {
            if flow.source_id.is_none() {
                side != "right"
                    && flow.target_id.is_some()
                    && flow.source_side.as_deref().unwrap_or("left") == side
            } else {
                flow.target_id.is_none()
                    && side == "right"
                    && flow.target_side.as_deref().unwrap_or("right") == side
            }
        }) {
            return Err(
                "Граничная стрелка не соответствует интерфейсу родительского блока.".into(),
            );
        }
        Ok(())
    }
    fn sync_interfaces(&mut self) {
        for _ in 0..self.models.len() {
            for index in 0..self.models.len() {
                let m = &self.models[index];
                let owner_name = self
                    .parent(m)
                    .and_then(|p| {
                        p.blocks
                            .iter()
                            .find(|b| Some(&b.id) == m.parent_block_id.as_ref())
                    })
                    .map(|b| b.name.clone());
                let flows = m
                    .flows
                    .iter()
                    .filter_map(|f| {
                        if f.parent_flow_id.is_none() {
                            return Some(f.clone());
                        }
                        let (parent, side, position) = self.interface(m, f)?;
                        if if f.source_id.is_none() {
                            side == "right"
                        } else {
                            side != "right"
                        } {
                            return None;
                        }
                        let mut copy = f.clone();
                        copy.name = parent.name.clone();
                        copy.object_ids = parent.object_ids.clone();
                        if f.source_id.is_none() {
                            copy.source_side = Some(side.into());
                            copy.source_position = Some(position);
                        } else {
                            copy.target_side = Some(side.into());
                            copy.target_position = Some(position);
                        }
                        Some(copy)
                    })
                    .collect();
                if let Some(name) = owner_name {
                    self.models[index].name = name;
                }
                self.models[index].flows = flows;
            }
        }
    }
    fn qualifier_mut(&mut self, id: &str) -> AppResult<&mut Qualifier> {
        self.qualifiers
            .iter_mut()
            .find(|q| q.id == id)
            .ok_or_else(|| "Классификатор не найден.".into())
    }
    fn model_mut(&mut self, id: &str) -> AppResult<&mut Model> {
        self.models
            .iter_mut()
            .find(|m| m.id == id)
            .ok_or_else(|| "Модель не найдена.".into())
    }
    fn apply(&mut self, command: Command) -> AppResult<()> {
        match command {
            Command::UpdateProject { name, description } => {
                self.name = name;
                self.description = description;
            }
            Command::AddQualifier { qualifier } => self.qualifiers.push(qualifier),
            Command::UpdateQualifier {
                id,
                name,
                description,
            } => {
                let q = self.qualifier_mut(&id)?;
                q.name = name;
                q.description = description;
            }
            Command::DeleteQualifier { id } => {
                self.qualifier_mut(&id)?;
                self.qualifiers.retain(|q| q.id != id);
            }
            Command::AddElement {
                qualifier_id,
                element,
            } => self.qualifier_mut(&qualifier_id)?.elements.push(element),
            Command::UpdateElement {
                qualifier_id,
                element,
            } => {
                let e = self
                    .qualifier_mut(&qualifier_id)?
                    .elements
                    .iter_mut()
                    .find(|e| e.id == element.id)
                    .ok_or("Элемент не найден.")?;
                *e = element;
            }
            Command::DeleteElement { qualifier_id, id } => {
                let q = self.qualifier_mut(&qualifier_id)?;
                if !q.elements.iter().any(|e| e.id == id) {
                    return Err("Элемент не найден.".into());
                }
                q.elements.retain(|e| e.id != id);
            }
            Command::AddModel { model } => self.models.push(model),
            Command::DecomposeBlock {
                model_id,
                block_id,
                child_id,
                count,
                layout,
                block_name_prefix,
            } => {
                if self
                    .models
                    .iter()
                    .any(|m| m.parent_block_id.as_deref() == Some(&block_id))
                {
                    return Err("Декомпозиция уже существует.".into());
                }
                let parent = self.model_mut(&model_id)?.clone();
                let owner = parent
                    .blocks
                    .iter()
                    .find(|b| b.id == block_id)
                    .ok_or("Блок не найден.")?;
                let count = count.unwrap_or(3);
                let layout = layout.as_deref().unwrap_or("diagonal");
                if !(2..=20).contains(&count)
                    || !["diagonal", "horizontal", "vertical"].contains(&layout)
                {
                    return Err("Выберите от 2 до 20 функций и поддерживаемый шаблон.".into());
                }
                if owner.kind.as_deref().unwrap_or("process") != "process" {
                    return Err("Декомпозиция доступна только для процесса.".into());
                }
                let prefix = block_name_prefix.as_deref().unwrap_or("Функция");
                if prefix.trim().is_empty() || prefix.chars().count() > 240 {
                    return Err("Укажите имя до 256 символов и описание до 10 000 символов.".into());
                }
                let context = self.node(&parent);
                let mut child = Model {
                    id: child_id.clone(),
                    name: owner.name.clone(),
                    description: owner.description.clone(),
                    notation: parent.notation.clone(),
                    background_color: parent.background_color.clone(),
                    parent_block_id: Some(block_id),
                    flows: vec![],
                    sheet: Some(parent.sheet.clone().unwrap_or_default()),
                    blocks: (0..count)
                        .map(|i| {
                            let (x, y) = decomposition_position(i, count, layout);
                            Block {
                                id: format!("{child_id}-{}", i + 1),
                                name: format!("{prefix} {}", i + 1),
                                description: "".into(),
                                x,
                                y,
                                width: None,
                                height: None,
                                kind: None,
                                fill_color: None,
                                text_color: None,
                            }
                        })
                        .collect(),
                };
                let node = self.node(&child);
                if let Some(sheet) = &mut child.sheet {
                    sheet.node = node;
                    sheet.context = context;
                    sheet.number.clear();
                }
                self.models.push(child);
            }
            Command::UpdateModel {
                id,
                name,
                description,
                sheet,
                background_color,
            } => {
                let m = self.model_mut(&id)?;
                m.name = name;
                m.description = description;
                if let Some(color) = background_color {
                    m.background_color = Some(color);
                }
                if let Some(sheet) = sheet {
                    m.sheet = Some(sheet);
                }
                let owner_id = m.parent_block_id.clone();
                let name = m.name.clone();
                if let Some(owner_id) = owner_id {
                    for model in &mut self.models {
                        if let Some(b) = model.blocks.iter_mut().find(|b| b.id == owner_id) {
                            b.name = name.clone();
                        }
                    }
                }
            }
            Command::DeleteModel { id } => {
                if self
                    .models
                    .iter()
                    .any(|m| self.parent(m).is_some_and(|p| p.id == id))
                {
                    return Err("Сначала удалите дочерние диаграммы.".into());
                }
                self.model_mut(&id)?;
                self.models.retain(|m| m.id != id);
            }
            Command::CenterArrows { model_id, block_id } => {
                let model = self.model_mut(&model_id)?;
                if block_id
                    .as_ref()
                    .is_some_and(|id| !model.blocks.iter().any(|b| &b.id == id))
                {
                    return Err("Блок не найден.".into());
                }
                for flow in &mut model.flows {
                    if flow.source_id.is_some()
                        && (block_id.is_none() || flow.source_id == block_id)
                    {
                        flow.source_position = Some(0.5);
                    }
                    if flow.target_id.is_some()
                        && (block_id.is_none() || flow.target_id == block_id)
                    {
                        flow.target_position = Some(0.5);
                    }
                }
            }
            Command::AddBlock { model_id, block } => self.model_mut(&model_id)?.blocks.push(block),
            Command::UpdateBlock { model_id, block } => {
                let b = self
                    .model_mut(&model_id)?
                    .blocks
                    .iter_mut()
                    .find(|b| b.id == block.id)
                    .ok_or("Блок не найден.")?;
                *b = block;
            }
            Command::DeleteBlock { model_id, id } => {
                if self
                    .models
                    .iter()
                    .any(|m| m.parent_block_id.as_deref() == Some(&id))
                {
                    return Err("Сначала удалите декомпозицию блока.".into());
                }
                let m = self.model_mut(&model_id)?;
                if !m.blocks.iter().any(|b| b.id == id) {
                    return Err("Блок не найден.".into());
                }
                m.blocks.retain(|b| b.id != id);
                m.flows.retain(|f| {
                    f.source_id.as_deref() != Some(&id) && f.target_id.as_deref() != Some(&id)
                });
            }
            Command::AddFlow { model_id, flow } => {
                self.check_flow_interface(&model_id, &flow)?;
                self.model_mut(&model_id)?.flows.push(flow);
            }
            Command::UpdateFlow { model_id, flow } => {
                self.check_flow_interface(&model_id, &flow)?;
                let f = self
                    .model_mut(&model_id)?
                    .flows
                    .iter_mut()
                    .find(|f| f.id == flow.id)
                    .ok_or("Связь не найдена.")?;
                *f = flow;
            }
            Command::DeleteFlow { model_id, id } => {
                let m = self.model_mut(&model_id)?;
                if !m.flows.iter().any(|f| f.id == id) {
                    return Err("Связь не найдена.".into());
                }
                m.flows.retain(|f| f.id != id);
            }
        }
        self.sync_interfaces();
        self.validate()
    }
}

pub struct Session {
    project: Project,
    saved: Project,
    revision: u64,
    path: Option<PathBuf>,
    undo: Vec<Project>,
    redo: Vec<Project>,
}
impl Session {
    pub fn new(project: Project) -> AppResult<Self> {
        project.validate()?;
        Ok(Self {
            saved: project.clone(),
            project,
            revision: 0,
            path: None,
            undo: vec![],
            redo: vec![],
        })
    }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            project: self.project.clone(),
            revision: self.revision.to_string(),
            path: self.path.as_ref().map(|p| p.to_string_lossy().into_owned()),
            dirty: self.project != self.saved,
            can_undo: !self.undo.is_empty(),
            can_redo: !self.redo.is_empty(),
        }
    }
    fn check_revision(&self, expected: &str) -> AppResult<()> {
        if expected != self.revision.to_string() {
            Err("Проект уже изменён. Обновите представление и повторите действие.".into())
        } else {
            Ok(())
        }
    }
    pub fn execute(&mut self, expected: &str, command: Command) -> AppResult<Snapshot> {
        self.check_revision(expected)?;
        let mut next = self.project.clone();
        next.apply(command)?;
        if next != self.project {
            self.undo.push(self.project.clone());
            if self.undo.len() > HISTORY_LIMIT {
                self.undo.remove(0);
            }
            self.project = next;
            self.redo.clear();
            self.revision += 1;
        }
        Ok(self.snapshot())
    }
    pub fn undo(&mut self, expected: &str) -> AppResult<Snapshot> {
        self.check_revision(expected)?;
        if let Some(previous) = self.undo.pop() {
            self.redo
                .push(std::mem::replace(&mut self.project, previous));
            self.revision += 1;
        }
        Ok(self.snapshot())
    }
    pub fn redo(&mut self, expected: &str) -> AppResult<Snapshot> {
        self.check_revision(expected)?;
        if let Some(next) = self.redo.pop() {
            self.undo.push(std::mem::replace(&mut self.project, next));
            self.revision += 1;
        }
        Ok(self.snapshot())
    }
    pub fn replace(
        &mut self,
        expected: &str,
        project: Project,
        path: Option<PathBuf>,
    ) -> AppResult<Snapshot> {
        self.check_revision(expected)?;
        project.validate()?;
        self.saved = project.clone();
        self.project = project;
        self.path = path;
        self.undo.clear();
        self.redo.clear();
        self.revision += 1;
        Ok(self.snapshot())
    }
    pub fn save(&mut self, expected: &str, destination: &Path) -> AppResult<Snapshot> {
        self.check_revision(expected)?;
        self.project.validate()?;
        let bytes = serde_json::to_vec_pretty(&self.project).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > FILE_LIMIT {
            return Err("Размер проекта превышает 16 МБ.".into());
        }
        let parent = destination
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|e| format!("Не удалось подготовить файл: {e}"))?;
        temporary
            .write_all(&bytes)
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|e| format!("Не удалось записать проект: {e}"))?;
        temporary
            .persist(destination)
            .map_err(|e| format!("Не удалось заменить файл проекта: {e}"))?;
        self.saved = self.project.clone();
        self.path = Some(destination.to_owned());
        Ok(self.snapshot())
    }
}

pub fn read_project(path: &Path) -> AppResult<Project> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > FILE_LIMIT {
        return Err("Размер проекта превышает 16 МБ.".into());
    }
    let bytes = fs::read(path).map_err(|e| format!("Не удалось прочитать файл: {e}"))?;
    let project: Project =
        serde_json::from_slice(&bytes).map_err(|e| format!("Некорректный проект Tamus: {e}"))?;
    project.validate()?;
    Ok(project)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> Project {
        serde_json::from_str(include_str!("../../../../fixtures/example.tamus.json")).unwrap()
    }
    #[test]
    fn localized_decomposition_names_match_preview() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../fixtures/localized-decomposition.json"
        ))
        .unwrap();
        let mut session = Session::new(project()).unwrap();
        for command in fixture["commands"].as_array().unwrap() {
            let revision = session.snapshot().revision;
            session
                .execute(&revision, serde_json::from_value(command.clone()).unwrap())
                .unwrap();
        }
        let snapshot = session.snapshot();
        for (id, names) in fixture["expected"].as_object().unwrap() {
            let model = snapshot
                .project
                .models
                .iter()
                .find(|m| &m.id == id)
                .unwrap();
            assert_eq!(
                serde_json::to_value(model.blocks.iter().map(|b| &b.name).collect::<Vec<_>>())
                    .unwrap(),
                *names
            );
        }
        assert_eq!(snapshot.project.models[0], project().models[0]);
        for prefix in ["".to_string(), "  ".to_string(), "a".repeat(241)] {
            let mut command = fixture["commands"][0].clone();
            command["blockNamePrefix"] = prefix.into();
            let mut fresh = Session::new(project()).unwrap();
            assert!(
                fresh
                    .execute("0", serde_json::from_value(command).unwrap())
                    .is_err()
            );
            assert_eq!(fresh.snapshot().project, project());
        }
    }
    #[test]
    fn dfd_fixture_matches_preview_and_rejects_invalid_connections() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../../fixtures/dfd-scenario.json")).unwrap();
        let mut session = Session::new(project()).unwrap();
        for (index, command) in fixture["commands"].as_array().unwrap().iter().enumerate() {
            let revision = session.snapshot().revision;
            session
                .execute(&revision, serde_json::from_value(command.clone()).unwrap())
                .unwrap();
            if index == 3 {
                assert!(
                    session.snapshot().project.models[1].blocks[0]
                        .fill_color
                        .is_none()
                );
                assert!(
                    session.snapshot().project.models[1].blocks[0]
                        .text_color
                        .is_none()
                );
            }
        }
        let expected: Project = serde_json::from_value(fixture["expected"].clone()).unwrap();
        assert_eq!(session.snapshot().project, expected);
        assert_eq!(expected.node(&expected.models[2]), "0");
        assert_eq!(expected.node(&expected.models[3]), "1");
        for value in fixture["invalidProjects"].as_array().unwrap() {
            let invalid: Project = serde_json::from_value(value.clone()).unwrap();
            assert!(invalid.validate().is_err());
        }
        for command in fixture["invalidCommands"].as_array().unwrap() {
            let revision = session.snapshot().revision;
            assert!(
                session
                    .execute(&revision, serde_json::from_value(command.clone()).unwrap())
                    .is_err()
            );
            assert_eq!(session.snapshot().project, expected);
        }
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("dfd.tamus.json");
        let revision = session.snapshot().revision;
        session.save(&revision, &path).unwrap();
        assert_eq!(read_project(&path).unwrap(), expected);
        session.undo(&revision).unwrap();
        let revision = session.snapshot().revision;
        session.redo(&revision).unwrap();
        assert_eq!(session.snapshot().project, expected);
    }
    #[test]
    fn ramus_workflow_matches_preview_and_protects_referenced_objects() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../../fixtures/ramus-workflow.json")).unwrap();
        let mut session = Session::new(project()).unwrap();
        for command in fixture["commands"].as_array().unwrap() {
            let revision = session.snapshot().revision;
            session
                .execute(&revision, serde_json::from_value(command.clone()).unwrap())
                .unwrap();
        }
        let expected: Project = serde_json::from_value(fixture["expected"].clone()).unwrap();
        assert_eq!(session.snapshot().project, expected);
        assert!(
            session
                .execute(
                    "6",
                    Command::DeleteElement {
                        qualifier_id: "documents".into(),
                        id: "request".into()
                    }
                )
                .is_err()
        );
        assert_eq!(session.snapshot().project, expected);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workflow.tamus.json");
        session.save("6", &path).unwrap();
        assert_eq!(read_project(&path).unwrap(), expected);
        session.undo("6").unwrap();
        session.redo("7").unwrap();
        assert_eq!(session.snapshot().project, expected);
    }
    #[test]
    fn idef0_preview_and_native_commands_produce_identical_hierarchy() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../../fixtures/idef0-scenario.json")).unwrap();
        let mut session = Session::new(project()).unwrap();
        for command in fixture["commands"].as_array().unwrap() {
            let revision = session.snapshot().revision;
            session
                .execute(&revision, serde_json::from_value(command.clone()).unwrap())
                .unwrap();
        }
        let expected: Project = serde_json::from_value(fixture["expected"].clone()).unwrap();
        assert_eq!(session.snapshot().project, expected);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("hierarchy.tamus.json");
        session.save("5", &path).unwrap();
        assert_eq!(read_project(&path).unwrap(), expected);
        session
            .execute(
                "5",
                Command::DeleteFlow {
                    model_id: "orders".into(),
                    id: "request-flow".into(),
                },
            )
            .unwrap();
        assert!(session.snapshot().project.models[1].flows.is_empty());
        assert!(session.snapshot().project.models[2].flows.is_empty());
        session.undo("6").unwrap();
        assert_eq!(session.snapshot().project, expected);
        session.undo("7").unwrap();
        assert_eq!(
            session.snapshot().project.models[1].flows[0]
                .source_side
                .as_deref(),
            Some("left")
        );
    }
    #[test]
    fn decomposition_cannot_orphan_children_or_form_cycles() {
        let mut session = Session::new(project()).unwrap();
        session
            .execute(
                "0",
                Command::DecomposeBlock {
                    model_id: "orders".into(),
                    block_id: "receive".into(),
                    child_id: "child".into(),
                    count: None,
                    layout: None,
                    block_name_prefix: None,
                },
            )
            .unwrap();
        assert_eq!(
            session.snapshot().project.models[1]
                .sheet
                .as_ref()
                .unwrap()
                .node,
            "A1"
        );
        assert!(
            session
                .execute(
                    "1",
                    Command::DeleteBlock {
                        model_id: "orders".into(),
                        id: "receive".into()
                    }
                )
                .is_err()
        );
        assert!(
            session
                .execute(
                    "1",
                    Command::DeleteModel {
                        id: "orders".into()
                    }
                )
                .is_err()
        );
        let mut cyclic = session.snapshot().project;
        cyclic.models[0].parent_block_id = Some("child-1".into());
        assert!(cyclic.validate().is_err());
        session.undo("1").unwrap();
        assert_eq!(session.snapshot().project.models.len(), 1);
        session.redo("2").unwrap();
        assert_eq!(session.snapshot().project.models.len(), 2);
    }
    #[test]
    fn icom_sides_and_boundary_directions_are_validated() {
        for side in ["left", "top", "bottom"] {
            let mut p = project();
            p.models[0].flows.push(serde_json::from_value(serde_json::json!({"id":"boundary", "name":"Ресурс", "sourceId":null,"targetId":"receive","sourceSide":side,"targetSide":side})).unwrap());
            assert!(p.validate().is_ok());
        }
        for flow in [
            serde_json::json!({"sourceId":"receive","targetId":"verify","sourceSide":"left"}),
            serde_json::json!({"sourceId":"receive","targetId":"verify","targetSide":"right"}),
            serde_json::json!({"sourceId":null,"targetId":"verify","sourceSide":"right"}),
            serde_json::json!({"sourceId":"receive","targetId":null,"targetSide":"left"}),
            serde_json::json!({"sourceId":null,"targetId":null}),
            serde_json::json!({"sourceId":"receive","targetId":"verify","sourcePosition":2.0}),
        ] {
            let mut p = project();
            let mut raw = flow;
            raw["id"] = serde_json::json!("invalid");
            raw["name"] = serde_json::json!("Стрелка");
            p.models[0].flows.push(serde_json::from_value(raw).unwrap());
            assert!(p.validate().is_err());
        }
    }
    #[test]
    fn sheet_fields_survive_save_reopen_and_undo() {
        let original = project();
        assert!(original.models[0].sheet.is_none()); // Legacy schema 1 files have no sheet.
        let sheet: DiagramSheet = serde_json::from_value(serde_json::json!({
            "author": "Иванов И. И.", "createdAt": "2026-10-21", "revisedAt": "",
            "usedAt": "", "notes": "", "reader": "", "readerDate": "",
            "number": "17", "node": "A0", "context": "ВЕРХ"
        }))
        .unwrap();
        let mut s = Session::new(original.clone()).unwrap();
        s.execute(
            "0",
            Command::UpdateModel {
                id: "orders".into(),
                name: original.models[0].name.clone(),
                description: original.models[0].description.clone(),
                sheet: Some(sheet.clone()),
                background_color: None,
            },
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sheet.tamus.json");
        s.save("1", &path).unwrap();
        assert_eq!(read_project(&path).unwrap().models[0].sheet, Some(sheet));
        s.undo("1").unwrap();
        assert!(s.snapshot().project.models[0].sheet.is_none());
        s.redo("2").unwrap();
        assert!(s.snapshot().project.models[0].sheet.is_some());
    }
    #[test]
    fn sheet_rejects_unknown_fields_and_oversized_values() {
        let raw = serde_json::json!({
            "author": "x".repeat(257), "createdAt": "", "revisedAt": "",
            "usedAt": "", "notes": "", "reader": "", "readerDate": "",
            "number": "", "node": "A0", "context": "ВЕРХ"
        });
        let mut p = project();
        p.models[0].sheet = Some(serde_json::from_value(raw.clone()).unwrap());
        assert!(p.validate().is_err());
        let mut unknown = raw;
        unknown["extra"] = serde_json::json!(true);
        assert!(serde_json::from_value::<DiagramSheet>(unknown).is_err());
    }
    #[test]
    fn invalid_command_is_atomic() {
        let mut s = Session::new(project()).unwrap();
        let before = s.snapshot().project;
        assert!(
            s.execute(
                "0",
                Command::UpdateProject {
                    name: "  ".into(),
                    description: "".into()
                }
            )
            .is_err()
        );
        assert_eq!(s.snapshot().project, before);
        assert_eq!(s.snapshot().revision, "0");
        assert!(!s.snapshot().can_undo);
    }
    #[test]
    fn stale_revision_cannot_overwrite_newer_edit() {
        let mut s = Session::new(project()).unwrap();
        s.execute(
            "0",
            Command::UpdateProject {
                name: "Новая версия".into(),
                description: "".into(),
            },
        )
        .unwrap();
        assert!(
            s.execute(
                "0",
                Command::DeleteModel {
                    id: "orders".into()
                }
            )
            .is_err()
        );
        assert_eq!(s.snapshot().project.models.len(), 1);
    }
    #[test]
    fn deletion_removes_flows_and_undo_restores_them() {
        let mut s = Session::new(project()).unwrap();
        s.execute(
            "0",
            Command::DeleteBlock {
                model_id: "orders".into(),
                id: "verify".into(),
            },
        )
        .unwrap();
        assert!(s.snapshot().project.models[0].flows.is_empty());
        s.undo("1").unwrap();
        assert_eq!(s.snapshot().project.models[0].flows.len(), 2);
        assert!(!s.snapshot().dirty);
        s.redo("2").unwrap();
        assert!(s.snapshot().dirty);
    }
    #[test]
    fn dangling_flow_and_duplicate_id_are_rejected() {
        let mut p = project();
        p.models[0].flows[0].target_id = Some("missing".into());
        assert!(p.validate().is_err());
        let mut p = project();
        p.qualifiers[0].elements[0].id = p.id.clone();
        assert!(p.validate().is_err());
    }
    #[test]
    fn save_round_trip_and_clean_point_survive_undo() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("model.tamus.json");
        let mut s = Session::new(project()).unwrap();
        s.execute(
            "0",
            Command::UpdateProject {
                name: "Проверка UTF-8".into(),
                description: "Описание".into(),
            },
        )
        .unwrap();
        s.save("1", &path).unwrap();
        assert_eq!(read_project(&path).unwrap(), s.snapshot().project);
        assert!(!s.snapshot().dirty);
        s.undo("1").unwrap();
        assert!(s.snapshot().dirty);
        s.redo("2").unwrap();
        assert!(!s.snapshot().dirty);
        s.save("3", &path).unwrap();
        assert_eq!(read_project(&path).unwrap().name, "Проверка UTF-8");
    }
    #[test]
    fn failed_save_does_not_mark_project_clean_or_change_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("existing.tamus.json");
        let mut s = Session::new(project()).unwrap();
        s.save("0", &path).unwrap();
        let original = fs::read(&path).unwrap();
        s.execute(
            "0",
            Command::UpdateProject {
                name: "Изменённый".into(),
                description: "".into(),
            },
        )
        .unwrap();
        assert!(
            s.save("1", &dir.path().join("missing/model.tamus.json"))
                .is_err()
        );
        assert!(s.snapshot().dirty);
        assert_eq!(fs::read(&path).unwrap(), original);
    }
    #[test]
    fn unknown_fields_and_future_versions_are_not_silently_discarded() {
        let mut raw = serde_json::to_value(project()).unwrap();
        raw["futureData"] = serde_json::json!(true);
        assert!(serde_json::from_value::<Project>(raw).is_err());
        let mut p = project();
        p.schema_version = 2;
        assert!(p.validate().is_err());
    }
    #[test]
    fn oversized_save_does_not_create_an_unreadable_file() {
        let mut project = project();
        for i in 0..1800 {
            project.qualifiers[0].elements.push(Element {
                id: format!("large-{i}"),
                name: "Запись".into(),
                description: "x".repeat(10000),
            });
        }
        let mut session = Session::new(project).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.tamus.json");
        assert!(session.save("0", &path).is_err());
        assert!(!path.exists());
    }
}
