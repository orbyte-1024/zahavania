"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IMAGE_CREDITS } from "@/lib/landing-images";
import "@/components/credits.css";

export function CreditsPage() {
  const t = useTranslations("credits");
  return (
    <main className="credits">
      <Link className="credits-back mono" href="/">
        {t("back")}
      </Link>
      <header className="credits-head">
        <p className="mono ash">{t("kicker")}</p>
        <h1 className="credits-title">{t("title")}</h1>
        <p className="credits-lead">{t("lead")}</p>
      </header>
      <ol className="credits-list">
        {IMAGE_CREDITS.images.map((image) => (
          <li key={image.file} className="credit">
            <Image className="credit-thumb" src={image.file} width={image.width} height={image.height} sizes="120px" alt="" loading="lazy" />
            <div className="credit-body">
              <p className="credit-name">{image.title}</p>
              <p className="mono ash">
                {t("author")} · {image.author}
              </p>
              <p className="mono ash">
                {t("license")} ·{" "}
                {image.licenseUrl ? (
                  <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer">
                    {image.license}
                  </a>
                ) : (
                  image.license
                )}
              </p>
              <a className="credit-source mono" href={image.sourceUrl} target="_blank" rel="noopener noreferrer">
                {t("source")}
              </a>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
