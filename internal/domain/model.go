package domain

type FieldKind string

const (
	FieldText    FieldKind = "text"
	FieldNumber  FieldKind = "number"
	FieldBool    FieldKind = "boolean"
	FieldDate    FieldKind = "date"
	FieldURL     FieldKind = "url"
	FieldEnum    FieldKind = "enum"
	FieldList    FieldKind = "list"
	FieldRef     FieldKind = "ref"
	FieldRefList FieldKind = "ref_list"
	FieldJSON    FieldKind = "json"
)

type TypeDef struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Fields      []FieldDef `json:"fields,omitempty"`
}

type FieldDef struct {
	ID          string    `json:"id"`
	TypeID      string    `json:"type_id"`
	Name        string    `json:"name"`
	Kind        FieldKind `json:"kind"`
	Required    bool      `json:"required"`
	Unique      bool      `json:"unique"`
	EnumValues  []string  `json:"enum_values,omitempty"`
	TargetType  string    `json:"target_type,omitempty"`
	Position    int       `json:"position"`
	Description string    `json:"description,omitempty"`
}

type Object struct {
	ID          string         `json:"id"`
	TypeID      string         `json:"type_id"`
	Title       string         `json:"title"`
	BodyPath    string         `json:"body_path"`
	BodyAbsPath string         `json:"body_abs_path"`
	Fields      map[string]any `json:"fields"`
	CreatedAt   string         `json:"created_at"`
	UpdatedAt   string         `json:"updated_at"`
}

type Link struct {
	ID        int64  `json:"id"`
	FromID    string `json:"from_id"`
	ToID      string `json:"to_id"`
	Kind      string `json:"kind"`
	Relation  string `json:"relation"`
	FieldID   string `json:"field_id,omitempty"`
	Line      int    `json:"line,omitempty"`
	Text      string `json:"text,omitempty"`
	Resolved  bool   `json:"resolved"`
	CreatedAt string `json:"created_at"`
}

type Issue struct {
	ID        int64  `json:"id"`
	ObjectID  string `json:"object_id,omitempty"`
	FieldID   string `json:"field_id,omitempty"`
	Kind      string `json:"kind"`
	Severity  string `json:"severity"`
	Message   string `json:"message"`
	CreatedAt string `json:"created_at"`
}
