import { readFile, readdir } from "fs/promises";
import { bucket_name } from "./constants"
import { GetObjectCommand, S3Client, paginateListDirectoryBuckets, paginateListObjectsV2 } from "@aws-sdk/client-s3";
import { env } from "process";

export interface Comic {
  title: string;
  image_urls: string[];
  link: string;
  uploaded_at: string;
  upvotes: number;
}

export interface Image {
  ocr: string;
  height: number;
  width: number;
  file_path: string;
}

export interface Series {
  title: string;
  // AKA the name of the folder containing the series
  id: string
  comics: Comic[];
}

export interface Metadata {
  series: Series;
  images: Record<string, Image>
}

const s3Client = new S3Client({})

async function readJsonFileLocal<T>(path: string): Promise<T> {
  try {
    const fullPath = `${ROOT_DIR}/${path}`;
    const fileContent = await readFile(fullPath, "utf8");
    return JSON.parse(fileContent);
  } catch (e) {
    console.error(e, path);
    throw e;
  }
}

async function readJsonFileS3<T>(path: string): Promise<T> {
  try {
    const command = new GetObjectCommand({Bucket: bucket_name, Key: path})
    const response = await s3Client.send(command);
    const body = response.Body
    if (body === undefined) {
      throw new Error("Invalid response.Body")
    }
    const content = await body.transformToString()
    return JSON.parse(content);
  } catch (e) {
    console.error(e, path);
    throw e;
  }
}

const readJsonFile = bucket_name === undefined ? readJsonFileLocal : readJsonFileS3

const ROOT_DIR = "./public/images";

async function getAllDirectories() {
  if (bucket_name === undefined) {
    return await readdir(ROOT_DIR)
  }
  const paginator = paginateListObjectsV2({client: s3Client}, {Bucket: bucket_name, Delimiter: '/'})
  const listOfFolders: string[] = []
  for await (const page of paginator) {
    const objects = page.CommonPrefixes;
    objects?.forEach((file) => file.Prefix && listOfFolders.push(file.Prefix.slice(undefined, -1)))
  }
  return listOfFolders
}

export async function getAllMetadata() {
  const directories = await getAllDirectories();
  const metadata = await Promise.all(directories.map(getSpecificMetadata));
  return metadata;
}

export async function getSpecificMetadata(dir: string) {
  const path = `${dir}/metadata.json`;
  const file = await readJsonFile<Metadata>(path);
  return { ...file};
}

export function getImageUrl(image: Image) {
  const imagePath = image.file_path.replace("./results/", "")
  if (bucket_name === undefined){
    return `/images/${imagePath}`;
  }
  if (env.NODE_ENV === "development") {
    return `http://${bucket_name}.s3-website-us-east-1.amazonaws.com/${imagePath}`
  }
}

export function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export const formatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
