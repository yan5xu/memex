package markdown

import (
	"regexp"
	"strings"
)

type BodyLink struct {
	Target string `json:"target"`
	Text   string `json:"text"`
	Line   int    `json:"line"`
}

var wikiRe = regexp.MustCompile(`\[\[([^\]]+)\]\]`)

func ExtractWikiLinks(body string) []BodyLink {
	var out []BodyLink
	for i, line := range strings.Split(body, "\n") {
		for _, match := range wikiRe.FindAllStringSubmatch(line, -1) {
			target := strings.TrimSpace(match[1])
			text := target
			if before, after, ok := strings.Cut(target, "|"); ok {
				target = strings.TrimSpace(before)
				text = strings.TrimSpace(after)
			}
			if target == "" {
				continue
			}
			out = append(out, BodyLink{Target: target, Text: text, Line: i + 1})
		}
	}
	return out
}
