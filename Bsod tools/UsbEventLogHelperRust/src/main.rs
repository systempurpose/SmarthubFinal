use regex::Regex;
use serde::Serialize;
use std::collections::BTreeMap;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
struct Event {
    provider: String,
    event_id: Option<u32>,
    level: Option<String>,
    time_created: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Serialize)]
struct OutputReport {
    ok: bool,
    minutes: u64,
    max: u32,
    events: Vec<Event>,
    counts_by_provider: BTreeMap<String, u32>,
    counts_by_event_id: BTreeMap<String, u32>,
    error: Option<String>,
    raw_truncated: Option<String>,
}

fn parse_arg_u64(args: &[String], name: &str, default: u64) -> u64 {
    for i in 0..args.len() {
        if args[i] == name {
            if let Some(v) = args.get(i + 1) {
                if let Ok(n) = v.parse::<u64>() {
                    return n;
                }
            }
        }
    }
    default
}

fn parse_arg_u32(args: &[String], name: &str, default: u32) -> u32 {
    for i in 0..args.len() {
        if args[i] == name {
            if let Some(v) = args.get(i + 1) {
                if let Ok(n) = v.parse::<u32>() {
                    return n;
                }
            }
        }
    }
    default
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    let minutes = parse_arg_u64(&args, "--minutes", 60);
    let max = parse_arg_u32(&args, "--max", 120);

    // wevtutil query: last N minutes, warning(3)/error(2) only.
    let ms = minutes.saturating_mul(60).saturating_mul(1000);
    let query = format!(
        "*[System[(Level=2 or Level=3) and TimeCreated[timediff(@SystemTime) <= {}]]]",
        ms
    );

    let out = Command::new("wevtutil")
        .args([
            "qe",
            "System",
            &format!("/q:{}", query),
            "/f:RenderedText",
            "/rd:true",
            &format!("/c:{}", max),
        ])
        .output();

    let mut report = OutputReport {
        ok: false,
        minutes,
        max,
        events: vec![],
        counts_by_provider: BTreeMap::new(),
        counts_by_event_id: BTreeMap::new(),
        error: None,
        raw_truncated: None,
    };

    let output = match out {
        Ok(o) => o,
        Err(e) => {
            report.error = Some(format!("Failed to run wevtutil: {}", e));
            println!("{}", serde_json::to_string(&report).unwrap());
            return;
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        report.error = Some(format!("wevtutil failed: {}", stderr.trim()));
        println!("{}", serde_json::to_string(&report).unwrap());
        return;
    }

    let raw = String::from_utf8_lossy(&output.stdout).to_string();

    // RenderedText format is block-based. We'll parse the common fields.
    // Example markers often include:
    //   Provider Name: Microsoft-Windows-Kernel-PnP
    //   Event ID: 219
    //   Level: Warning
    //   Date: 2026-03-09T...
    //   Description:
    //       ...
    let re_provider = Regex::new(r"(?im)^\s*Provider Name:\s*(.+?)\s*$").unwrap();
    let re_event_id = Regex::new(r"(?im)^\s*Event ID:\s*(\d+)\s*$").unwrap();
    let re_level = Regex::new(r"(?im)^\s*Level:\s*(.+?)\s*$").unwrap();
    let re_date = Regex::new(r"(?im)^\s*Date:\s*(.+?)\s*$").unwrap();

    // Split into owned blocks.
    let mut owned_blocks: Vec<String> = vec![];
    let mut buf: Vec<String> = vec![];
    for line in raw.lines() {
        if line.trim().is_empty() {
            if !buf.is_empty() {
                owned_blocks.push(buf.join("\n"));
            }
            buf.clear();
        } else {
            buf.push(line.to_string());
        }
    }
    if !buf.is_empty() {
        owned_blocks.push(buf.join("\n"));
    }

    let mut events: Vec<Event> = vec![];
    for b in owned_blocks.into_iter() {
        let provider = re_provider
            .captures(&b)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();

        // If we don't even have a provider, skip the block.
        if provider.is_empty() {
            continue;
        }

        let event_id = re_event_id
            .captures(&b)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().trim().parse::<u32>().ok());

        let level = re_level
            .captures(&b)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string());

        let time_created = re_date
            .captures(&b)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string());

        let description = {
            let mut found = None;
            let mut lines = b.lines();
            while let Some(line) = lines.next() {
                if line.trim_start().to_ascii_lowercase().starts_with("description:") {
                    let rest = line.splitn(2, ':').nth(1).unwrap_or("").trim();
                    let mut desc_lines: Vec<String> = vec![];
                    if !rest.is_empty() {
                        desc_lines.push(rest.to_string());
                    }
                    for _ in 0..7 {
                        if let Some(l) = lines.next() {
                            if l.trim().is_empty() {
                                break;
                            }
                            desc_lines.push(l.trim_end().to_string());
                        }
                    }
                    let joined = desc_lines.join("\n").trim().to_string();
                    if !joined.is_empty() {
                        found = Some(joined);
                    }
                    break;
                }
            }
            found
        };

        events.push(Event {
            provider,
            event_id,
            level,
            time_created,
            description,
        });
    }

    let mut counts_by_provider: BTreeMap<String, u32> = BTreeMap::new();
    let mut counts_by_event_id: BTreeMap<String, u32> = BTreeMap::new();

    for e in &events {
        *counts_by_provider.entry(e.provider.clone()).or_insert(0) += 1;
        if let Some(id) = e.event_id {
            *counts_by_event_id.entry(id.to_string()).or_insert(0) += 1;
        }
    }

    report.ok = true;
    report.events = events;
    report.counts_by_provider = counts_by_provider;
    report.counts_by_event_id = counts_by_event_id;

    // Prevent huge payloads in callers; keep a truncated raw preview.
    let raw_preview: String = raw.lines().take(120).collect::<Vec<_>>().join("\n");
    report.raw_truncated = Some(raw_preview);

    println!("{}", serde_json::to_string(&report).unwrap());
}
