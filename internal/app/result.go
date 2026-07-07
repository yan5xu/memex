package app

type Result struct {
	OK       bool      `json:"ok"`
	Code     int       `json:"code"`
	Data     any       `json:"data,omitempty"`
	Error    *AppError `json:"error,omitempty"`
	Warnings []Warning `json:"warnings,omitempty"`
	Effects  []Effect  `json:"effects,omitempty"`
}

type AppError struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
}

type Warning struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
}

type Effect struct {
	Kind   string `json:"kind"`
	Object string `json:"object,omitempty"`
	Field  string `json:"field,omitempty"`
}

func OK(data any, effects ...Effect) Result {
	return Result{OK: true, Code: 0, Data: data, Effects: effects}
}

func Fail(kind, message string) Result {
	return Result{OK: false, Code: 1, Error: &AppError{Kind: kind, Message: message}}
}
