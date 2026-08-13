sed -i '570,582c\
    baseRow["Industry"] = r.industry || "N/A";\
    baseRow["Company Summary"] = r.companySummary || "N/A";\
    baseRow["Estimated Size"] = r.estimatedSize || "N/A";\
    baseRow["Decision Maker"] = r.decisionMakerName || "N/A";\
    baseRow["DM Role"] = r.decisionMakerRole || "N/A";\
    baseRow["LinkedIn Profile"] = r.linkedinUrl || "N/A";\
    baseRow["LinkedIn Type"] = r.linkedinType || "N/A";\
    baseRow["ICP Rating (/100)"] = r.icpRating ?? "N/A";\
    baseRow["Reason for PBS Need"] = r.reasonForPbsNeed || "N/A";\
    baseRow["Match Type"] = r.match_type || "N/A";\
    baseRow["Confidence Score"] = r.confidence_score || "N/A";\
    baseRow["Verification Status"] = r.verificationStatus || "N/A";\
    baseRow["Enrichment Status"] = r.status;\
    baseRow["Internal Notes"] = r.notes || "";\
' src/utils/csvUtils.ts
