#!/bin/sh
# Create the `judge` user and its own copy of the evaluator. Run once, as root:
#
#   sudo scripts/setup_judge.sh <workspace> <git remote url>
#
#   <workspace>       your working copy, e.g. ~/Degen (the AI works here)
#   <git remote url>  e.g. git@github.com:ywewake/degen.git
#
# Afterwards the judge's home is readable only by the judge. It holds the
# evaluator code, the sealed exam, the judge database, the exam-log git
# memory and the judge's GitHub key. The judge can read your workspace;
# your user (and so the AI) cannot read or write anything of the judge's.
set -eu

[ $# -eq 2 ] || { echo "usage: sudo $0 <workspace> <git remote url>" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
WS=$(realpath "$1")
URL=$2
JUDGE=${JUDGE_USER:-judge}
BIN=${BIN_DIR:-/usr/local/bin}

DEV=$(stat -c %U "$WS")
DEVGROUP=$(id -gn "$DEV")
[ "$DEV" != root ] || { echo "The workspace is owned by root. Use your normal user's copy." >&2; exit 1; }
[ -x "$WS/loop" ] || { echo "$WS does not look like the Degen workspace." >&2; exit 1; }
if id "$JUDGE" >/dev/null 2>&1; then
    echo "User '$JUDGE' already exists. Refusing to reuse it." >&2; exit 1
fi

# The boundary is only as strong as sudo: if your user can sudo without a
# password, so can the AI, and it can become the judge.
if sudo -l -U "$DEV" 2>/dev/null | grep -q NOPASSWD; then
    echo "REFUSING: '$DEV' can run sudo without a password, so the AI could become the judge." >&2
    echo "Remove the NOPASSWD rule (sudo visudo, and files in /etc/sudoers.d), then re-run." >&2
    exit 1
fi

echo "Creating user '$JUDGE'..."
useradd --create-home --shell /bin/bash "$JUDGE"
HOME_J=$(getent passwd "$JUDGE" | cut -d: -f6)
chmod 700 "$HOME_J"
usermod -aG "$DEVGROUP" "$JUDGE"   # read access to the workspace, via your group

if ! runuser -u "$JUDGE" -- test -r "$WS/loop"; then
    echo "The judge cannot read $WS. Give your group read access to it and its parent folders," >&2
    echo "e.g. chmod g+rx \"$(dirname "$WS")\" \"$WS\", then re-run (after: sudo userdel -r $JUDGE)." >&2
    exit 1
fi

case "$URL" in
    git@*|ssh://*)
        runuser -u "$JUDGE" -- sh -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh &&
            ssh-keygen -q -t ed25519 -N "" -C degen-judge -f ~/.ssh/id_ed25519 &&
            ssh-keyscan -t ed25519 github.com > ~/.ssh/known_hosts 2>/dev/null'
        echo
        echo "Add this key on GitHub: repo -> Settings -> Deploy keys -> Add, with 'Allow write access':"
        echo
        cat "$HOME_J/.ssh/id_ed25519.pub"
        echo
        printf "Press Enter once it is added... "
        read -r _
        ;;
esac

REF=$(runuser -u "$DEV" -- git -C "$WS" rev-parse HEAD)
echo "Cloning the judge's copy at $REF..."
runuser -u "$JUDGE" -- git clone -q "$URL" "$HOME_J/Degen"
runuser -u "$JUDGE" -- git -C "$HOME_J/Degen" fetch -q origin "$REF" 2>/dev/null || true
runuser -u "$JUDGE" -- git -C "$HOME_J/Degen" checkout -q --detach "$REF" || {
    echo "Commit $REF is not on $URL. Push your workspace first." >&2; exit 1; }

printf 'workspace = %s\nuser = %s\n' "$WS" "$JUDGE" > "$HOME_J/Degen/judge.conf"
chown root:root "$HOME_J/Degen/judge.conf"
chmod 644 "$HOME_J/Degen/judge.conf"

cat > "$BIN/degen-judge" <<EOF
#!/bin/sh
if [ "\$(id -un)" != "$JUDGE" ]; then
    echo "Run as: sudo -u $JUDGE degen-judge \$*" >&2
    exit 1
fi
cd "$HOME_J/Degen" && exec ./degen-judge "\$@"
EOF
chown root:root "$BIN/degen-judge"
chmod 755 "$BIN/degen-judge"

runuser -u "$JUDGE" -- python3 -c "import cryptography" ||
    echo "WARNING: python3-cryptography is not installed: sudo apt install python3-cryptography" >&2
runuser -u "$JUDGE" -- bwrap --unshare-all --ro-bind / / true ||
    echo "WARNING: bubblewrap does not work for '$JUDGE': sudo apt install bubblewrap" >&2

cat <<EOF

Done. The judge is '$JUDGE'; its copy is $HOME_J/Degen at ${REF%"${REF#????????????}"}.

Next, in a terminal (never through an AI tool):
  sudo -u $JUDGE degen-judge init                    # once: create the exam log
  sudo -u $JUDGE degen-judge seal /path/to/exam.csv  # once: then delete the plaintext
  sudo -u $JUDGE degen-judge evaluate <id>
  sudo -u $JUDGE degen-judge update <branch>         # to take new evaluator code, after reading the diff
EOF
