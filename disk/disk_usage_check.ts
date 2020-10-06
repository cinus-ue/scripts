import { parse } from "https://deno.land/std/flags/mod.ts";

const HELP_MSG = `Usage: deno run disk_usage_check.ts [-f] [-i] [-h]
-i, --inode                    Display Inode breakdown
-f, --filesystem <filesystem>  Specify a Filesystem
-h, --help                     Print help (usage)
`;
const BREAK = "=".repeat(60);

const DECODER = new TextDecoder();

function printHeader(header: string) {
  console.log(BREAK + "\n\t" + header + "\n" + BREAK);
}

async function exec(args: string[]) {
  const p = Deno.run({ cmd: args, stdout: "piped" });
  const s = await p.status();
  if (s.success == false) {
    console.error("exec:" + s.code);
    Deno.exit(1);
  }
  const output = await p.output();
  return DECODER.decode(output).trim();
}

async function filesystemOverview(filesystem: string) {
  printHeader("Filesystem Overview");
  console.log(
    await exec([
      "sh",
      "-c",
      " df -PTh " + filesystem,
    ]),
  );
  console.log(
    await exec([
      "sh",
      "-c",
      " df -PTi " + filesystem,
    ]),
  );
}

async function checkInodes(filesystem: string) {
  const strFsMount = await exec(
    [
      "sh",
      "-c",
      "df -P " + filesystem + " | awk '$1 !~ /Filesystem/ {print $6}'",
    ],
  );
  console.log("Inode Information for [ " + strFsMount + " ]");
  console.log(
    await exec([
      "sh",
      "-c",
      "df -PTi " + strFsMount + " | column -t",
    ]),
  );
  printHeader("Storage device behind filesystem [ " + strFsMount + " ]");
  const strFsDev = await exec(
    [
      "sh",
      "-c",
      "df -P $PWD | awk '$0 !~ /Filesystem/ {print $1}'",
    ],
  );
  printHeader("Top inode Consumers on [ " + strFsMount + " ]");
  const inodeConsumer =
    `awk '{ printf "%11s \\t %-30s\\n", $1, $2 }' <(echo "inode-Count Path");
   awk '{ printf "%11'"'"'d \\t %-30s\\n", $1, $2 } ' <(
   strMounts="$(findmnt -o TARGET -rn | sed 's/^\\s*/\\^/g' | sed 's/$/\\$|/g' | tr -d '\\n' | sed 's/|$/\\n/')";
         find $strFsMount -maxdepth 5 -xdev -type d -print0 2>/dev/null | while IFS= read -rd '' i;
             do if ! echo $i | grep -E "$strMounts";
                 then echo "$(find "$i" -xdev | wc -l ) $i ";
             fi;
         done | sort -n -r | head -n 20
  ) ;`;
  console.log(
    await exec([
      "bash",
      "-c",
      inodeConsumer.replaceAll("$strFsMount", strFsMount),
    ]),
  );
  printHeader("Bytes per Inode format for [ " + strFsMount + " ]");
  const inodeBytes =
    `echo "$(printf "%.1f\n" $(echo "$(tune2fs -l $strFsDev | awk -F ": *" '$1 ~ /Inode count/ { inodecount = $2 }; $1 == "Block count" {printf "%s", $2}; $1 == "Block size" {printf "%s", " * " $2 " / " inodecount };' | tr -d '\\n') /1024" | bc)) KB per inode"'!'`;
  console.log(
    await exec([
      "bash",
      "-c",
      inodeBytes.replaceAll("$strFsDev", strFsDev),
    ]),
  );
  printHeader("Disk space [ " + strFsMount + " ]");
  filesystemOverview(filesystem);
}

async function checkFiles(filesystem: string) {
  printHeader("Largest Directories");
  console.log(
    await exec([
      "sh",
      "-c",
      "du -hcx --max-depth=2 " + filesystem +
      " 2>/dev/null | sort -rnk1,1 | head -10 | column -t 2>/dev/null",
    ]),
  );
  printHeader("Largest Files");
  console.log(
    await exec([
      "sh",
      "-c",
      "find " + filesystem +
      ' -mount -ignore_readdir_race -type f -exec du {} + 2>&1 | sort -rnk1,1 | head -20 | awk \'BEGIN{ CONVFMT="%.2f";}{ $1=( $1 / 1024 )"M"; print;}\' | column -t 2>/dev/null',
    ]),
  );
  printHeader("Top 5 Open DELETED Files over 500MB");
  console.log(
    await exec([
      "sh",
      "-c",
      "lsof 2>/dev/null | awk '/REG/ && /deleted/ {x=3;y=1; print $(NF-x) \"  \" $(NF-y) }' | sort -nr | uniq  | awk '{ if($1 > 524288000 ) print $1/1048576, \"MB \", $NF }' | head -5",
    ]),
  );
  filesystemOverview(filesystem);
}

function main() {
  const parsedArgs = parse(Deno.args, {
    boolean: ["help", "inode"],
    string: ["filesystem"],
    alias: {
      inode: ["i"],
      filesystem: ["f"],
      help: ["h"],
    },
  });

  if (parsedArgs.help) {
    return console.log(HELP_MSG);
  }

  let filesystem = parsedArgs.filesystem;
  if (
    typeof filesystem == "undefined" ||
    filesystem == null ||
    filesystem == ""
  ) {
    filesystem = "/";
  }

  const info = Deno.statSync(filesystem);
  if (!info.isDirectory) {
    console.error("Invalid Filesystem");
    console.log(HELP_MSG);
    Deno.exit(1);
  }
  printHeader("Filesystem Information");
  if (parsedArgs.inode) {
    console.log(
      "Checking Inodes. Please note this could take a while to run...",
    );
    checkInodes(filesystem);
  } else {
    checkFiles(filesystem);
  }
}

if (import.meta.main) {
  main();
}
