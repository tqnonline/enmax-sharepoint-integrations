using System;
using System.Collections.Generic;

namespace Enmax.AutoCAD
{
    public enum SharePointLibraryKind
    {
        DropOff,
        Destination,
    }

    /// <summary>A SharePoint file discovered during indexing (folder path is not used for matching).</summary>
    public readonly struct SharePointFoundFile
    {
        public SharePointFoundFile(
            string serverRelativeUrl,
            string absoluteUrl,
            SharePointLibraryKind libraryKind,
            string fileName)
        {
            ServerRelativeUrl = serverRelativeUrl;
            AbsoluteUrl = absoluteUrl;
            LibraryKind = libraryKind;
            FileName = fileName;
        }

        public string ServerRelativeUrl { get; }
        public string AbsoluteUrl { get; }
        public SharePointLibraryKind LibraryKind { get; }
        public string FileName { get; }
    }

    /// <summary>Stored SharePoint link fields on a Dataverse record.</summary>
    public readonly struct SharePointLinkState
    {
        public SharePointLinkState(
            string dropOffUrl,
            string destinationUrl,
            bool presentInDropOff,
            bool presentInDestination)
        {
            DropOffUrl = dropOffUrl;
            DestinationUrl = destinationUrl;
            PresentInDropOff = presentInDropOff;
            PresentInDestination = presentInDestination;
        }

        public string DropOffUrl { get; }
        public string DestinationUrl { get; }
        public bool PresentInDropOff { get; }
        public bool PresentInDestination { get; }
    }

    /// <summary>Freshly derived link state from an indexer scan.</summary>
    public readonly struct SharePointLinkMatchResult
    {
        public SharePointLinkMatchResult(
            string dropOffUrl,
            string destinationUrl,
            bool presentInDropOff,
            bool presentInDestination)
        {
            DropOffUrl = dropOffUrl;
            DestinationUrl = destinationUrl;
            PresentInDropOff = presentInDropOff;
            PresentInDestination = presentInDestination;
        }

        public string DropOffUrl { get; }
        public string DestinationUrl { get; }
        public bool PresentInDropOff { get; }
        public bool PresentInDestination { get; }
    }

    /// <summary>Whether a Dataverse update is required and the target state if so.</summary>
    public readonly struct SharePointLinkUpsertDecision
    {
        public SharePointLinkUpsertDecision(bool updateNeeded, SharePointLinkState newState)
        {
            UpdateNeeded = updateNeeded;
            NewState = newState;
        }

        public bool UpdateNeeded { get; }
        public SharePointLinkState NewState { get; }
    }

    /// <summary>
    /// Pure, side-effect-free SharePoint filename matching for the WS5 indexer.
    /// Compares normalized PDF filenames against a known record number string (exact, case-insensitive).
    /// </summary>
    public static class SharePointLinkMatcher
    {
        private const string PdfExtension = ".pdf";

        /// <summary>
        /// Strips a single trailing .pdf extension (case-insensitive) and surrounding whitespace.
        /// Returns null when the name is not a PDF.
        /// </summary>
        public static string NormalizeToNumberToken(string fileName)
        {
            if (fileName == null)
                return null;

            var trimmed = fileName.Trim();
            if (trimmed.Length == 0)
                return null;

            // WHY: indexer only links PDF uploads; other extensions must never match a record number.
            if (!trimmed.EndsWith(PdfExtension, StringComparison.OrdinalIgnoreCase))
                return null;

            return trimmed.Substring(0, trimmed.Length - PdfExtension.Length);
        }

        /// <summary>
        /// Returns true when the normalized PDF token equals the record number exactly (case-insensitive).
        /// Near-misses and non-PDF names never match.
        /// </summary>
        public static bool Matches(string fileName, string recordNumber)
        {
            var token = NormalizeToNumberToken(fileName);
            if (token == null || string.IsNullOrWhiteSpace(recordNumber))
                return false;

            return string.Equals(token, recordNumber.Trim(), StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Matches a record number against discovered files by filename only (folder paths ignored).
        /// Returns the first matching URL per library kind; unmatched files are ignored.
        /// </summary>
        public static SharePointLinkMatchResult MatchFiles(
            string recordNumber,
            IEnumerable<SharePointFoundFile> foundFiles)
        {
            if (foundFiles == null || string.IsNullOrWhiteSpace(recordNumber))
                return EmptyMatchResult();

            string dropOffUrl = null;
            string destinationUrl = null;

            foreach (var file in foundFiles)
            {
                if (!Matches(file.FileName, recordNumber))
                    continue;

                switch (file.LibraryKind)
                {
                    case SharePointLibraryKind.DropOff when dropOffUrl == null:
                        dropOffUrl = file.AbsoluteUrl;
                        break;
                    case SharePointLibraryKind.Destination when destinationUrl == null:
                        destinationUrl = file.AbsoluteUrl;
                        break;
                }

                if (dropOffUrl != null && destinationUrl != null)
                    break;
            }

            return new SharePointLinkMatchResult(
                dropOffUrl,
                destinationUrl,
                presentInDropOff: dropOffUrl != null,
                presentInDestination: destinationUrl != null);
        }

        /// <summary>
        /// Idempotent upsert decision: identical inputs yield UpdateNeeded=false; file removal clears url + flag.
        /// </summary>
        public static SharePointLinkUpsertDecision ComputeUpsert(
            SharePointLinkState current,
            SharePointLinkMatchResult freshlyDerived)
        {
            var newState = new SharePointLinkState(
                freshlyDerived.DropOffUrl,
                freshlyDerived.DestinationUrl,
                freshlyDerived.PresentInDropOff,
                freshlyDerived.PresentInDestination);

            var updateNeeded =
                !StringEquals(current.DropOffUrl, newState.DropOffUrl)
                || !StringEquals(current.DestinationUrl, newState.DestinationUrl)
                || current.PresentInDropOff != newState.PresentInDropOff
                || current.PresentInDestination != newState.PresentInDestination;

            return new SharePointLinkUpsertDecision(updateNeeded, newState);
        }

        private static SharePointLinkMatchResult EmptyMatchResult() =>
            new SharePointLinkMatchResult(null, null, false, false);

        private static bool StringEquals(string left, string right) =>
            string.Equals(left, right, StringComparison.Ordinal);
    }
}
