package cli

import (
	"strings"
	"testing"
)

func TestCommandPrefixUsesMMXCommandName(t *testing.T) {
	rootDir = "/tmp/example-vault"
	if got := commandPrefix(); !strings.HasPrefix(got, "mmx -C ") {
		t.Fatalf("command prefix does not start with mmx: %q", got)
	}
}

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
