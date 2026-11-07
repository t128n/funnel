//! Rune settings/status window. The real form lands in a later slice.

use rune::tok::{self, space, type_};
use rune::{AppSpec, Cx, El, col, text};

#[derive(Default)]
struct State;

fn view(_: &State, cx: &mut Cx<State>) -> El {
    let t = tok::theme(cx.system_dark());
    col()
        .w_full()
        .h_full()
        .fill(t.bg)
        .px(space::S6)
        .py(space::S6)
        .gap(space::S3)
        .child(
            text("Funnel Intake")
                .key("title")
                .font(type_::TITLE)
                .color(t.text),
        )
        .child(
            text("Settings are not available yet")
                .key("status")
                .font(type_::BODY)
                .color(t.text_secondary),
        )
}

pub fn run(_options: &crate::cli::Options) -> Result<(), String> {
    rune::run(AppSpec::new(
        "Funnel Intake",
        (480.0, 260.0),
        State::default,
        view,
    ));
    Ok(())
}
