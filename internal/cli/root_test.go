package cli

import "testing"

func TestHelpFlagIsDetectedAfterPreprocess(t *testing.T) {
	rootDir = "."
	jsonOut = false
	jsonFields = nil
	jqExpr = ""

	argv, err := preprocess([]string{"-C", "/tmp/example-vault", "source", "add", "--help"})
	if err != nil {
		t.Fatal(err)
	}
	if rootDir != "/tmp/example-vault" {
		t.Fatalf("expected rootDir to be set, got %q", rootDir)
	}
	if !hasHelpArg(argv) {
		t.Fatalf("expected --help to be detected in %#v", argv)
	}
}
