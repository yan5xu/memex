package app

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/yan5xu/mmx/internal/domain"
	"github.com/yan5xu/mmx/internal/store"
)

type graphNodeValue struct {
	Field string `json:"field"`
	Value string `json:"value"`
}

type graphNodeDisplay struct {
	Variant  string           `json:"variant"`
	Title    string           `json:"title"`
	Subtitle string           `json:"subtitle,omitempty"`
	Meta     []graphNodeValue `json:"meta,omitempty"`
	Badges   []graphNodeValue `json:"badges,omitempty"`
	Image    string           `json:"image,omitempty"`
}

type graphProjectedNode struct {
	ID      string           `json:"id"`
	TypeID  string           `json:"type_id"`
	Title   string           `json:"title"`
	Fields  map[string]any   `json:"fields"`
	Depth   int              `json:"depth"`
	Display graphNodeDisplay `json:"display"`
}

type graphBridgeDetail struct {
	ID     string         `json:"id"`
	TypeID string         `json:"type_id"`
	Title  string         `json:"title"`
	Fields map[string]any `json:"fields"`
}

type graphProjectedEdge struct {
	FromID    string              `json:"from_id"`
	ToID      string              `json:"to_id"`
	Kind      string              `json:"kind"`
	Relation  string              `json:"relation"`
	Label     string              `json:"label,omitempty"`
	Count     int                 `json:"count"`
	Derived   bool                `json:"derived"`
	ViaIDs    []string            `json:"via_ids,omitempty"`
	Via       []graphBridgeDetail `json:"via,omitempty"`
	Relations []string            `json:"relations,omitempty"`
	seen      map[string]bool
}

type graphQueryResult struct {
	View   graphView            `json:"view"`
	Center string               `json:"center"`
	Nodes  []graphProjectedNode `json:"nodes"`
	Edges  []graphProjectedEdge `json:"edges"`
	Stats  map[string]int       `json:"stats"`
}

type graphTrace struct {
	IDs   []string
	Edges []domain.Link
}

func (r *Runner) runGraphView(args []string) Result {
	if len(args) == 0 || args[0] == "list" {
		return r.runGraphViews([]string{"list"})
	}
	switch args[0] {
	case "show":
		if len(args) < 2 {
			return Fail("usage", "usage: graph view show <id>")
		}
		config, err := r.readGraphViewConfig()
		if err != nil {
			return fromErr(err)
		}
		view, ok := findGraphView(config, args[1])
		if !ok {
			return Fail("not_found", "graph view not found: "+args[1])
		}
		return OK(view)
	case "validate":
		config, err := r.readGraphViewInput(parseFlags(args[1:]), false)
		if err != nil {
			return fromErr(err)
		}
		return r.validateGraphViewResult(config)
	case "apply":
		config, err := r.readGraphViewInput(parseFlags(args[1:]), true)
		if err != nil {
			return fromErr(err)
		}
		return r.validateAndWriteGraphViewConfig(config)
	case "schema":
		return OK(graphViewSchema())
	default:
		return Fail("unknown_command", "unknown graph view command: "+args[0])
	}
}

func (r *Runner) runGraphQuery(args []string) Result {
	flags := parseFlags(args)
	viewID := flags.Get("view")
	centerID := flags.Get("center")
	if viewID == "" || centerID == "" {
		return Fail("usage", "usage: graph query --view <id> --center <object-id>")
	}
	config, err := r.readGraphViewConfig()
	if err != nil {
		return fromErr(err)
	}
	view, ok := findGraphView(config, viewID)
	if !ok {
		return Fail("not_found", "graph view not found: "+viewID)
	}
	return r.withStore(func(s *store.Store) Result {
		types, err := s.ListTypes()
		if err != nil {
			return fromErr(err)
		}
		if err := validateGraphViewConfig(config, types); err != nil {
			return fromErr(err)
		}
		objects, err := s.ListObjects("", 100000)
		if err != nil {
			return fromErr(err)
		}
		links, err := s.AllLinks()
		if err != nil {
			return fromErr(err)
		}
		result, err := executeGraphView(view, centerID, objects, links)
		if err != nil {
			return fromErr(err)
		}
		return OK(result)
	})
}

func (r *Runner) readGraphViewInput(flags Flags, requireInput bool) (graphViewConfig, error) {
	var raw []byte
	var err error
	if path := flags.Get("file"); path != "" {
		raw, err = os.ReadFile(path)
	} else if flags.Bool("stdin") {
		if r.Stdin == nil {
			return graphViewConfig{}, fmt.Errorf("stdin is required")
		}
		raw, err = io.ReadAll(r.Stdin)
	} else if requireInput {
		return graphViewConfig{}, fmt.Errorf("graph view apply requires --file <path> or --stdin")
	} else {
		return r.readGraphViewConfig()
	}
	if err != nil {
		return graphViewConfig{}, err
	}
	var config graphViewConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return graphViewConfig{}, err
	}
	return normalizeGraphViewConfig(config)
}

func (r *Runner) validateGraphViewResult(config graphViewConfig) Result {
	return r.withStore(func(s *store.Store) Result {
		types, err := s.ListTypes()
		if err != nil {
			return fromErr(err)
		}
		if err := validateGraphViewConfig(config, types); err != nil {
			return fromErr(err)
		}
		return OK(map[string]any{"valid": true, "views": len(config.Views), "config": config})
	})
}

func (r *Runner) validateAndWriteGraphViewConfig(config graphViewConfig) Result {
	config, err := normalizeGraphViewConfig(config)
	if err != nil {
		return fromErr(err)
	}
	return r.withStore(func(s *store.Store) Result {
		types, err := s.ListTypes()
		if err != nil {
			return fromErr(err)
		}
		if err := validateGraphViewConfig(config, types); err != nil {
			return fromErr(err)
		}
		if err := r.writeGraphViewConfig(config); err != nil {
			return fromErr(err)
		}
		return OK(config, Effect{Kind: "graph.views.write"})
	})
}

func findGraphView(config graphViewConfig, id string) (graphView, bool) {
	for _, view := range config.Views {
		if view.ID == id {
			return view, true
		}
	}
	return graphView{}, false
}

func graphViewPaths(view graphView) []graphViewPath {
	if len(view.Paths) > 0 {
		return view.Paths
	}
	if len(view.Steps) > 0 {
		return []graphViewPath{{Steps: view.Steps}}
	}
	return nil
}

func validateGraphViewConfig(config graphViewConfig, types []domain.TypeDef) error {
	typeByID := make(map[string]domain.TypeDef, len(types))
	for _, typeDef := range types {
		typeByID[typeDef.ID] = typeDef
	}
	for viewIndex, view := range config.Views {
		root, ok := typeByID[view.RootType]
		if !ok {
			return fmt.Errorf("views[%d].root_type: type %q does not exist", viewIndex, view.RootType)
		}
		_ = root
		for pathIndex, path := range graphViewPaths(view) {
			currentType := view.RootType
			for stepIndex, step := range path.Steps {
				if step.TargetType == "" {
					return fmt.Errorf("views[%d].paths[%d].steps[%d].target_type is required", viewIndex, pathIndex, stepIndex)
				}
				target, ok := typeByID[step.TargetType]
				if !ok {
					return fmt.Errorf("views[%d].paths[%d].steps[%d].target_type: type %q does not exist", viewIndex, pathIndex, stepIndex, step.TargetType)
				}
				fieldType := currentType
				fieldTarget := step.TargetType
				fieldOwner := typeByID[currentType]
				if step.Direction == "in" {
					fieldType = step.TargetType
					fieldTarget = currentType
					fieldOwner = target
				}
				field, ok := graphField(fieldOwner, step.Relation)
				if !ok {
					return fmt.Errorf("views[%d].paths[%d].steps[%d]: field %q does not exist on type %s", viewIndex, pathIndex, stepIndex, step.Relation, fieldType)
				}
				if field.Kind != domain.FieldRef && field.Kind != domain.FieldRefList {
					return fmt.Errorf("views[%d].paths[%d].steps[%d]: field %s.%s is %s, not ref/ref_list", viewIndex, pathIndex, stepIndex, fieldType, step.Relation, field.Kind)
				}
				if field.TargetType != fieldTarget {
					return fmt.Errorf("views[%d].paths[%d].steps[%d]: field %s.%s targets %s, not %s", viewIndex, pathIndex, stepIndex, fieldType, step.Relation, field.TargetType, fieldTarget)
				}
				currentType = step.TargetType
			}
		}
		for typeID, template := range view.Nodes {
			typeDef, ok := typeByID[typeID]
			if !ok {
				return fmt.Errorf("views[%d].nodes.%s: type does not exist", viewIndex, typeID)
			}
			if template.Variant != "" && template.Variant != "compact" && template.Variant != "standard" && template.Variant != "rich" {
				return fmt.Errorf("views[%d].nodes.%s.variant must be compact, standard, or rich", viewIndex, typeID)
			}
			fields := append([]string{template.TitleField, template.SubtitleField, template.ImageField}, template.MetaFields...)
			fields = append(fields, template.BadgeFields...)
			for _, field := range fields {
				if field != "" && !graphDisplayFieldExists(typeDef, field) {
					return fmt.Errorf("views[%d].nodes.%s: display field %q does not exist", viewIndex, typeID, field)
				}
			}
		}
		for typeID, bridge := range view.Bridges {
			typeDef, ok := typeByID[typeID]
			if !ok {
				return fmt.Errorf("views[%d].bridges.%s: type does not exist", viewIndex, typeID)
			}
			for _, field := range bridge.LabelFields {
				if !graphDisplayFieldExists(typeDef, field) {
					return fmt.Errorf("views[%d].bridges.%s: label field %q does not exist", viewIndex, typeID, field)
				}
			}
		}
	}
	return nil
}

func graphField(typeDef domain.TypeDef, name string) (domain.FieldDef, bool) {
	for _, field := range typeDef.Fields {
		if field.Name == name {
			return field, true
		}
	}
	return domain.FieldDef{}, false
}

func graphDisplayFieldExists(typeDef domain.TypeDef, name string) bool {
	if name == "id" || name == "title" || name == "type" || name == "type_id" {
		return true
	}
	_, ok := graphField(typeDef, name)
	return ok
}

func executeGraphView(view graphView, centerID string, objects []domain.Object, links []domain.Link) (graphQueryResult, error) {
	objectByID := make(map[string]domain.Object, len(objects))
	for _, object := range objects {
		objectByID[object.ID] = object
	}
	center, ok := objectByID[centerID]
	if !ok {
		return graphQueryResult{}, fmt.Errorf("center object not found: %s", centerID)
	}
	if center.TypeID != view.RootType {
		return graphQueryResult{}, fmt.Errorf("center object %s is %s, expected %s", centerID, center.TypeID, view.RootType)
	}
	fieldLinks := make([]domain.Link, 0, len(links))
	for _, link := range links {
		if link.Kind == "field" && link.Resolved {
			fieldLinks = append(fieldLinks, link)
		}
	}
	sort.Slice(fieldLinks, func(i, j int) bool {
		if fieldLinks[i].FromID != fieldLinks[j].FromID {
			return fieldLinks[i].FromID < fieldLinks[j].FromID
		}
		if fieldLinks[i].Relation != fieldLinks[j].Relation {
			return fieldLinks[i].Relation < fieldLinks[j].Relation
		}
		return fieldLinks[i].ToID < fieldLinks[j].ToID
	})
	nodeDepth := map[string]int{centerID: 0}
	projectedEdges := make(map[string]*graphProjectedEdge)
	for _, path := range graphViewPaths(view) {
		traces := []graphTrace{{IDs: []string{centerID}}}
		for _, step := range path.Steps {
			traces = extendGraphTraces(traces, step, fieldLinks, objectByID)
			if len(traces) == 0 {
				break
			}
		}
		for _, trace := range traces {
			projectGraphTrace(view, path, trace, objectByID, nodeDepth, projectedEdges)
		}
	}
	nodes := make([]graphProjectedNode, 0, len(nodeDepth))
	for id, depth := range nodeDepth {
		object := objectByID[id]
		template := view.Nodes[object.TypeID]
		nodes = append(nodes, graphProjectedNode{
			ID: object.ID, TypeID: object.TypeID, Title: object.Title, Fields: object.Fields, Depth: depth,
			Display: buildGraphNodeDisplay(object, template),
		})
	}
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].Depth != nodes[j].Depth {
			return nodes[i].Depth < nodes[j].Depth
		}
		if nodes[i].Display.Title != nodes[j].Display.Title {
			return nodes[i].Display.Title < nodes[j].Display.Title
		}
		return nodes[i].ID < nodes[j].ID
	})
	edges := make([]graphProjectedEdge, 0, len(projectedEdges))
	for _, edge := range projectedEdges {
		sort.Strings(edge.ViaIDs)
		sort.Slice(edge.Via, func(i, j int) bool { return edge.Via[i].ID < edge.Via[j].ID })
		if edge.Derived && edge.Count > 1 {
			edge.Label = strconv.Itoa(edge.Count) + " " + pluralizeGraphType(graphViaType(edge.Via))
		}
		edges = append(edges, *edge)
	}
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].FromID != edges[j].FromID {
			return edges[i].FromID < edges[j].FromID
		}
		if edges[i].ToID != edges[j].ToID {
			return edges[i].ToID < edges[j].ToID
		}
		return edges[i].Relation < edges[j].Relation
	})
	return graphQueryResult{
		View: view, Center: centerID, Nodes: nodes, Edges: edges,
		Stats: map[string]int{"nodes": len(nodes), "edges": len(edges), "derived_edges": countDerivedGraphEdges(edges)},
	}, nil
}

func extendGraphTraces(traces []graphTrace, step graphViewStep, links []domain.Link, objectByID map[string]domain.Object) []graphTrace {
	var out []graphTrace
	for _, trace := range traces {
		frontier := trace.IDs[len(trace.IDs)-1]
		for _, link := range links {
			if link.Relation != step.Relation {
				continue
			}
			targetID := ""
			if step.Direction == "out" && link.FromID == frontier {
				targetID = link.ToID
			} else if step.Direction == "in" && link.ToID == frontier {
				targetID = link.FromID
			}
			if targetID == "" {
				continue
			}
			target, ok := objectByID[targetID]
			if !ok || (step.TargetType != "" && target.TypeID != step.TargetType) {
				continue
			}
			next := graphTrace{IDs: append(append([]string(nil), trace.IDs...), targetID), Edges: append(append([]domain.Link(nil), trace.Edges...), link)}
			out = append(out, next)
		}
	}
	return out
}

func projectGraphTrace(view graphView, path graphViewPath, trace graphTrace, objectByID map[string]domain.Object, nodeDepth map[string]int, projected map[string]*graphProjectedEdge) {
	visibleFromIndex := 0
	visibleDepth := 0
	for stepIndex, step := range path.Steps {
		targetIndex := stepIndex + 1
		target := objectByID[trace.IDs[targetIndex]]
		if graphStepIsBridge(view, step, target.TypeID) {
			continue
		}
		visibleDepth++
		if previous, ok := nodeDepth[target.ID]; !ok || visibleDepth < previous {
			nodeDepth[target.ID] = visibleDepth
		}
		segmentEdges := trace.Edges[visibleFromIndex:targetIndex]
		viaIDs := trace.IDs[visibleFromIndex+1 : targetIndex]
		addProjectedGraphEdge(view, trace.IDs[visibleFromIndex], target.ID, segmentEdges, viaIDs, objectByID, projected)
		visibleFromIndex = targetIndex
	}
}

func graphStepIsBridge(view graphView, step graphViewStep, typeID string) bool {
	if step.Display == "bridge" {
		return true
	}
	_, ok := view.Bridges[typeID]
	return ok
}

func addProjectedGraphEdge(view graphView, fromID, toID string, segment []domain.Link, viaIDs []string, objectByID map[string]domain.Object, projected map[string]*graphProjectedEdge) {
	if len(segment) == 0 {
		return
	}
	derived := len(viaIDs) > 0
	relations := make([]string, 0, len(segment))
	for _, edge := range segment {
		relations = append(relations, edge.Relation)
	}
	relation := segment[len(segment)-1].Relation
	key := fromID + "\x00" + toID + "\x00" + strings.Join(relations, "/")
	aggregate := true
	if derived {
		for _, viaID := range viaIDs {
			via := objectByID[viaID]
			if config, ok := view.Bridges[via.TypeID]; ok && config.Aggregate != nil && !*config.Aggregate {
				aggregate = false
			}
		}
	}
	if !aggregate {
		key += "\x00" + strings.Join(viaIDs, ",")
	}
	edge := projected[key]
	if edge == nil {
		edge = &graphProjectedEdge{FromID: fromID, ToID: toID, Kind: segment[len(segment)-1].Kind, Relation: relation, Count: 0, Derived: derived, Relations: relations, seen: make(map[string]bool)}
		projected[key] = edge
	}
	occurrenceParts := make([]string, 0, len(segment))
	for _, link := range segment {
		occurrenceParts = append(occurrenceParts, strconv.FormatInt(link.ID, 10))
	}
	occurrence := strings.Join(occurrenceParts, "/")
	if edge.seen[occurrence] {
		return
	}
	edge.seen[occurrence] = true
	edge.Count++
	for _, viaID := range viaIDs {
		if containsString(edge.ViaIDs, viaID) {
			continue
		}
		via := objectByID[viaID]
		edge.ViaIDs = append(edge.ViaIDs, viaID)
		edge.Via = append(edge.Via, graphBridgeDetail{ID: via.ID, TypeID: via.TypeID, Title: via.Title, Fields: via.Fields})
		if edge.Label == "" {
			edge.Label = buildGraphBridgeLabel(via, view.Bridges[via.TypeID])
		}
	}
}

func buildGraphNodeDisplay(object domain.Object, template graphNodeTemplate) graphNodeDisplay {
	variant := template.Variant
	if variant == "" {
		variant = "standard"
	}
	titleField := template.TitleField
	if titleField == "" {
		titleField = "title"
	}
	title := graphObjectFieldString(object, titleField)
	if title == "" {
		title = object.Title
	}
	if title == "" {
		title = object.ID
	}
	return graphNodeDisplay{
		Variant:  variant,
		Title:    title,
		Subtitle: graphObjectFieldString(object, template.SubtitleField),
		Meta:     graphNodeValues(object, template.MetaFields),
		Badges:   graphNodeValues(object, template.BadgeFields),
		Image:    graphObjectFieldString(object, template.ImageField),
	}
}

func graphNodeValues(object domain.Object, fields []string) []graphNodeValue {
	values := make([]graphNodeValue, 0, len(fields))
	for _, field := range fields {
		if value := graphObjectFieldString(object, field); value != "" {
			values = append(values, graphNodeValue{Field: field, Value: value})
		}
	}
	return values
}

func graphObjectFieldString(object domain.Object, field string) string {
	switch field {
	case "":
		return ""
	case "id":
		return object.ID
	case "title":
		return object.Title
	case "type", "type_id":
		return object.TypeID
	}
	return graphValueString(object.Fields[field])
}

func graphValueString(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case []string:
		return strings.Join(typed, ", ")
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := graphValueString(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, ", ")
	default:
		raw, _ := json.Marshal(typed)
		return string(raw)
	}
}

func buildGraphBridgeLabel(object domain.Object, config graphBridgeConfig) string {
	parts := make([]string, 0, len(config.LabelFields))
	for _, field := range config.LabelFields {
		if value := graphObjectFieldString(object, field); value != "" {
			parts = append(parts, value)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, " · ")
	}
	if object.Title != "" {
		return object.Title
	}
	return object.TypeID
}

func containsString(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}

func graphViaType(via []graphBridgeDetail) string {
	if len(via) == 0 || via[0].TypeID == "" {
		return "links"
	}
	return via[0].TypeID
}

func pluralizeGraphType(typeID string) string {
	if strings.HasSuffix(typeID, "s") {
		return typeID
	}
	return typeID + "s"
}

func countDerivedGraphEdges(edges []graphProjectedEdge) int {
	count := 0
	for _, edge := range edges {
		if edge.Derived {
			count++
		}
	}
	return count
}

func graphViewSchema() map[string]any {
	return map[string]any{
		"version":       2,
		"file":          "mmx.graph-views.json",
		"node_variants": []string{"compact", "standard", "rich"},
		"step_display":  []string{"node", "bridge"},
		"commands": []string{
			"graph view validate [--file <path>|--stdin]",
			"graph view apply --file <path>|--stdin",
			"graph query --view <id> --center <object-id>",
		},
	}
}
